//! Browser APIs and lifetime management. No game state is inferred from screen text.
use crate::{
    input::{InputEvent, Wait, WaitKind, key_event, keycode},
    presentation::{COLS, Mode, Presentation, ROWS},
};
use js_sys::{Array, Function, Int32Array, Object, Promise, Reflect, Uint8Array};
use serde_json::{Value, json};
use std::{cell::RefCell, collections::VecDeque, rc::Rc};
use wasm_bindgen::{Clamped, JsCast, prelude::*};
use wasm_bindgen_futures::JsFuture;
use web_sys::{
    CanvasRenderingContext2d, Document, Element, Event, HtmlCanvasElement, HtmlElement,
    HtmlInputElement, HtmlSelectElement, ImageData, KeyboardEvent, PointerEvent, Response,
};

const SAVE_KEY: &str = "brogue-nihon:files:v1:1.15.1";
type Shared = Rc<RefCell<Session>>;
struct Session {
    game: JsValue,
    presentation: Presentation,
    canvas: HtmlCanvasElement,
    context: CanvasRenderingContext2d,
    viewport: HtmlElement,
    wait: Wait,
    event_resolver: Option<Function>,
    pause_resolver: Option<Function>,
    pause_generation: u32,
    pending: VecDeque<InputEvent>,
    revision: u32,
    last_saved: String,
    centered: bool,
    selected_mode: String,
    preferred_zoom: String,
}
fn document() -> Document {
    web_sys::window().unwrap().document().unwrap()
}
fn element(id: &str) -> Element {
    document().get_element_by_id(id).unwrap()
}
fn failure(error: impl ToString) -> JsValue {
    JsValue::from_str(&error.to_string())
}
fn call(object: &JsValue, name: &str, args: &[JsValue]) -> Result<JsValue, JsValue> {
    let function: Function = Reflect::get(object, &JsValue::from_str(name))?.dyn_into()?;
    let values = Array::new();
    for value in args {
        values.push(value);
    }
    function.apply(object, &values)
}
fn status(message: &str) {
    element("status").set_text_content(Some(message));
}
fn report(error: JsValue) {
    status(&format!(
        "{}",
        error.as_string().unwrap_or_else(|| format!("{error:?}"))
    ));
    web_sys::console::error_1(&error);
}
async fn bytes(url: &str) -> Result<Vec<u8>, JsValue> {
    let response: Response = JsFuture::from(web_sys::window().unwrap().fetch_with_str(url))
        .await?
        .dyn_into()?;
    if !response.ok() {
        return Err(failure(format!(
            "Asset {}: HTTP {}",
            url,
            response.status()
        )));
    }
    Ok(Uint8Array::new(&JsFuture::from(response.array_buffer()?).await?).to_vec())
}
fn listen<E: JsCast + wasm_bindgen::convert::FromWasmAbi + 'static>(
    target: &web_sys::EventTarget,
    name: &str,
    handler: impl FnMut(E) + 'static,
) -> Result<(), JsValue> {
    let closure = Closure::wrap(Box::new(handler) as Box<dyn FnMut(E)>);
    target.add_event_listener_with_callback(name, closure.as_ref().unchecked_ref())?;
    closure.forget();
    Ok(())
}
fn visible(id: &str, show: bool) {
    let _ = element(id).set_attribute("hidden", "");
    if show {
        let _ = element(id).remove_attribute("hidden");
    }
}
fn storage() -> Result<web_sys::Storage, JsValue> {
    web_sys::window()
        .unwrap()
        .local_storage()?
        .ok_or_else(|| failure("Browser storage is unavailable"))
}
fn safe_filename(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 255
        && !name.contains(['/', '\\', '\0'])
        && name != "."
        && name != ".."
        && (name.ends_with(".broguesave")
            || name.ends_with(".broguerec")
            || name == "BrogueHighScores.txt")
}
fn filesystem(game: &JsValue) -> Result<JsValue, JsValue> {
    Reflect::get(game, &JsValue::from_str("FS"))
}
fn initialize_files(game: &JsValue) -> Result<(), JsValue> {
    let fs = filesystem(game)?;
    if call(&fs, "stat", &["/brogue".into()]).is_err() {
        call(&fs, "mkdir", &["/brogue".into()])?;
    }
    call(&fs, "chdir", &["/brogue".into()])?;
    if let Some(saved) = storage()?.get_item(SAVE_KEY)? {
        if saved.len() > 32 * 1024 * 1024 {
            return Err(failure("Saved files exceed the storage limit"));
        }
        let envelope: Value = serde_json::from_str(&saved).map_err(failure)?;
        if envelope["version"] != 1 || envelope["game"] != "BrogueCE1.15.1" {
            return Err(failure("Unsupported Brogue save container"));
        }
        let files = envelope["files"]
            .as_array()
            .filter(|files| files.len() <= 64)
            .ok_or_else(|| failure("Invalid Brogue save files"))?;
        // Validate the whole container before mutating the fresh filesystem.
        let mut validated = Vec::new();
        for file in files {
            let name = file["name"]
                .as_str()
                .filter(|name| safe_filename(name))
                .ok_or_else(|| failure("Invalid saved filename"))?;
            let values = file["bytes"]
                .as_array()
                .filter(|values| values.len() <= 8 * 1024 * 1024)
                .ok_or_else(|| failure("Invalid saved file size"))?;
            let data: Result<Vec<u8>, _> = values
                .iter()
                .map(|value| {
                    value
                        .as_u64()
                        .and_then(|v| u8::try_from(v).ok())
                        .ok_or_else(|| failure("Invalid saved bytes"))
                })
                .collect();
            validated.push((name.to_string(), data?));
        }
        for (name, data) in validated {
            call(
                &fs,
                "writeFile",
                &[name.into(), Uint8Array::from(data.as_slice()).into()],
            )?;
        }
    }
    Ok(())
}
fn persist_files(session: &mut Session) -> Result<(), JsValue> {
    let fs = filesystem(&session.game)?;
    let names = Array::from(&call(&fs, "readdir", &["/brogue".into()])?);
    let mut files = Vec::new();
    let mut saves = Vec::new();
    for name in names
        .iter()
        .filter_map(|name| name.as_string())
        .filter(|name| safe_filename(name))
    {
        let data = Uint8Array::new(&call(&fs, "readFile", &[name.clone().into()])?).to_vec();
        if data.len() > 8 * 1024 * 1024 {
            return Err(failure("A Brogue save file exceeds the storage limit"));
        }
        if name.ends_with(".broguesave") {
            saves.push(name.clone());
        }
        files.push(json!({"name":name,"bytes":data}));
    }
    let saved = json!({"version":1,"game":"BrogueCE1.15.1","files":files}).to_string();
    if saved != session.last_saved {
        storage()?.set_item(SAVE_KEY, &saved)?;
        session.last_saved = saved;
        let select: HtmlSelectElement = element("save-files").unchecked_into();
        let previous = select.value();
        select.set_inner_html("");
        for name in saves {
            let option = document().create_element("option")?;
            option.set_attribute("value", &name)?;
            option.set_text_content(Some(&name));
            select.append_child(&option)?;
        }
        if !previous.is_empty() {
            select.set_value(&previous);
        }
    }
    Ok(())
}
fn send(state: &Shared, event: InputEvent) {
    let mut session = state.borrow_mut();
    if event[0] == 0 && !session.wait.allows(event[1]) {
        return;
    }
    if let Some(resolve) = session.event_resolver.take() {
        let _ = resolve.call1(&JsValue::UNDEFINED, &Int32Array::from(event.as_slice()));
    } else if let Some(resolve) = session.pause_resolver.take() {
        session.pending.push_back(event);
        let _ = resolve.call1(&JsValue::UNDEFINED, &JsValue::TRUE);
    }
}
fn send_text(state: &Shared, text: &str) {
    let mut session = state.borrow_mut();
    if session.wait.kind != WaitKind::Text || session.event_resolver.is_none() {
        return;
    }
    let limit = session.wait.max_length;
    if text
        .chars()
        .any(|character| !session.wait.allows(character as i32))
    {
        status("この入力で使える文字を入力してください");
        return;
    }
    // The C owner may already contain a default filename. The native field
    // means replacement, so remove that value through its public edit keys.
    session
        .pending
        .extend((0..limit).map(|_| key_event(127, false, false)));
    session.pending.extend(
        text.chars()
            .take(limit)
            .map(|c| key_event(c as i32, false, false)),
    );
    session.pending.push_back(key_event(10, false, false));
    if let Some(event) = session.pending.pop_front() {
        let resolve = session.event_resolver.take().unwrap();
        let _ = resolve.call1(&JsValue::UNDEFINED, &Int32Array::from(event.as_slice()));
    }
}
fn send_pointer_click(state: &Shared, col: i32, row: i32, control: bool, shift: bool) {
    let mut session = state.borrow_mut();
    if session.event_resolver.is_none() && session.pause_resolver.is_none() {
        return;
    }
    for kind in [2, 1] {
        session
            .pending
            .push_back([kind, col, row, i32::from(control), i32::from(shift)]);
    }
    if let Some(resolve) = session.event_resolver.take() {
        let event = session.pending.pop_front().unwrap();
        let _ = resolve.call1(&JsValue::UNDEFINED, &Int32Array::from(event.as_slice()));
    } else if let Some(resolve) = session.pause_resolver.take() {
        let _ = resolve.call1(&JsValue::UNDEFINED, &JsValue::TRUE);
    }
}
fn update_controls(state: &Shared) -> Result<(), JsValue> {
    let session = state.borrow();
    let wait = &session.wait;
    visible("mobile-summary", wait.kind != WaitKind::Title);
    element("game").set_attribute("data-wait-kind", &format!("{:?}", wait.kind).to_lowercase())?;
    visible("commands", wait.kind == WaitKind::Command);
    visible(
        "directions",
        matches!(wait.kind, WaitKind::Command | WaitKind::Target),
    );
    visible("text-entry", wait.kind == WaitKind::Text);
    visible("cancel", wait.cancel);
    visible("submit", wait.kind == WaitKind::Target);
    element("choices").set_inner_html("");
    if !matches!(
        wait.kind,
        WaitKind::Command | WaitKind::Text | WaitKind::Target
    ) {
        for code in &wait.keys {
            let button = document().create_element("button")?;
            button.set_attribute("type", "button")?;
            button.set_attribute("data-key", &code.to_string())?;
            let label = match *code {
                10 => "Enter".into(),
                27 => "Esc".into(),
                32 => "Space".into(),
                9 => "Tab".into(),
                2000 => "日本語 / English".into(),
                63232 => "↑".into(),
                63233 => "↓".into(),
                63234 => "←".into(),
                63235 => "→".into(),
                63276 => "Page Up".into(),
                63277 => "Page Down".into(),
                _ => char::from_u32(*code as u32)
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| code.to_string()),
            };
            button.set_text_content(Some(&label));
            element("choices").append_child(&button)?;
        }
    }
    if wait.kind == WaitKind::Text {
        let input: HtmlInputElement = element("text-value").unchecked_into();
        input.set_max_length(wait.max_length.min(4096) as i32);
    }
    Ok(())
}
fn receive_wait(state: &Shared, descriptor: Int32Array) -> Result<(), JsValue> {
    let wait = Wait::from_descriptor(&descriptor.to_vec()).map_err(failure)?;
    let changed = {
        let mut session = state.borrow_mut();
        let changed = session.wait != wait;
        if session.wait.kind != wait.kind {
            // Saving can return directly to the title's pause loop without
            // another event() call. Persist once at that completed transition.
            if wait.kind == WaitKind::Title {
                if let Err(error) = persist_files(&mut session) {
                    report(error);
                }
            }
            session.pending.clear();
            element("text-value")
                .unchecked_into::<HtmlInputElement>()
                .set_value("");
            let modal = !matches!(wait.kind, WaitKind::Command | WaitKind::Target);
            let zoom = if modal {
                if session.viewport.client_width() < 700 {
                    "10".to_string()
                } else {
                    "fit".to_string()
                }
            } else {
                session.preferred_zoom.clone()
            };
            set_zoom(&mut session, &zoom);
            element("zoom")
                .unchecked_into::<HtmlSelectElement>()
                .set_value(&zoom);
            draw(&mut session)?;
            let (x, y) = match wait.kind {
                WaitKind::Title => (90, 28),
                WaitKind::Command | WaitKind::Target => {
                    session.presentation.player_cell().unwrap_or((50, 17))
                }
                WaitKind::Item => (84, 8),
                _ => (55, 17),
            };
            session.viewport.set_scroll_left(
                (x as u32 * session.presentation.cell_width) as i32
                    - session.viewport.client_width() / 2,
            );
            session.viewport.set_scroll_top(
                (y as u32 * session.presentation.cell_height) as i32
                    - session.viewport.client_height() / 2,
            );
        }
        session.wait = wait;
        changed
    };
    if changed {
        update_controls(state)?;
    }
    Ok(())
}
fn draw(session: &mut Session) -> Result<(), JsValue> {
    session.presentation.render().map_err(failure)?;
    let (width, height) = session.presentation.size();
    if session.canvas.width() != width {
        session.canvas.set_width(width);
    }
    if session.canvas.height() != height {
        session.canvas.set_height(height);
    }
    let pixels = ImageData::new_with_u8_clamped_array_and_sh(
        Clamped(session.presentation.renderer.rgba()),
        width,
        height,
    )?;
    session.context.put_image_data(&pixels, 0., 0.)?;
    let sidebar: HtmlCanvasElement = element("mobile-sidebar").unchecked_into();
    sidebar.set_width(session.presentation.cell_width * 20);
    sidebar.set_height(session.presentation.cell_height * 10);
    let sidebar_context: CanvasRenderingContext2d =
        sidebar.get_context("2d")?.unwrap().unchecked_into();
    sidebar_context.put_image_data(&pixels, 0., 0.)?;
    let lines = (0..3)
        .map(|row| {
            (21..COLS)
                .filter_map(|column| {
                    let cell = &session.presentation.cells[(row * COLS + column) * 10..];
                    if cell[0] == 0x110000 {
                        None
                    } else {
                        Some(
                            char::from_u32(cell[1] as u32)
                                .filter(|c| !c.is_control())
                                .unwrap_or(' '),
                        )
                    }
                })
                .collect::<String>()
                .trim()
                .to_string()
        })
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    element("mobile-messages").set_text_content(Some(&lines));
    session.revision += 1;
    session
        .canvas
        .set_attribute("data-frame-revision", &session.revision.to_string())?;
    session
        .canvas
        .set_attribute("data-display-mode", &session.selected_mode)?;
    if !session.centered && session.presentation.player_cell().is_some() {
        center_player(session);
        session.centered = true;
    }
    Ok(())
}
fn center_player(session: &mut Session) {
    if let Some((x, y)) = session.presentation.player_cell() {
        session.viewport.set_scroll_left(
            (x as u32 * session.presentation.cell_width) as i32
                - session.viewport.client_width() / 2,
        );
        session.viewport.set_scroll_top(
            (y as u32 * session.presentation.cell_height) as i32
                - session.viewport.client_height() / 2,
        );
    }
}
fn set_zoom(session: &mut Session, value: &str) {
    let width = if value == "fit" {
        (session.viewport.client_width().max(100) as u32 / COLS as u32).max(3)
    } else {
        value.parse::<u32>().unwrap_or(14).clamp(6, 32)
    };
    session.presentation.cell_width = width;
    session.presentation.cell_height = (width * 11 / 7).max(width + 1);
}
fn install_host(state: &Shared) -> Result<(), JsValue> {
    let host = Object::new();
    let target = state.clone();
    let frame = Closure::<dyn FnMut(Int32Array)>::new(move |values: Int32Array| {
        let result = (|| {
            let mut session = target.borrow_mut();
            let changed = session
                .presentation
                .snapshot(values.to_vec())
                .map_err(failure)?;
            if changed {
                draw(&mut session)?;
            }
            Ok::<_, JsValue>(())
        })();
        if let Err(error) = result {
            report(error);
        }
    });
    Reflect::set(&host, &"frame".into(), frame.as_ref())?;
    frame.forget();
    let target = state.clone();
    let event = Closure::<dyn FnMut(bool, bool, Int32Array) -> Promise>::new(
        move |_text: bool, _dance: bool, descriptor: Int32Array| {
            if let Err(error) = receive_wait(&target, descriptor) {
                return Promise::reject(&error);
            }
            {
                let mut session = target.borrow_mut();
                if let Err(error) = persist_files(&mut session) {
                    report(error);
                }
            }
            let target = target.clone();
            Promise::new(&mut move |resolve, _reject| {
                let mut session = target.borrow_mut();
                if let Some(event) = session.pending.pop_front() {
                    let _ = resolve.call1(&JsValue::UNDEFINED, &Int32Array::from(event.as_slice()));
                } else {
                    session.event_resolver = Some(resolve);
                }
            })
        },
    );
    Reflect::set(&host, &"event".into(), event.as_ref())?;
    event.forget();
    let target = state.clone();
    let pause = Closure::<dyn FnMut(i32, bool, Int32Array) -> Promise>::new(
        move |milliseconds: i32, _mouse: bool, descriptor: Int32Array| {
            if let Err(error) = receive_wait(&target, descriptor) {
                return Promise::reject(&error);
            }
            let target = target.clone();
            Promise::new(&mut move |resolve, _reject| {
                let generation = {
                    let mut session = target.borrow_mut();
                    if !session.pending.is_empty() {
                        let _ = resolve.call1(&JsValue::UNDEFINED, &JsValue::TRUE);
                        return;
                    }
                    session.pause_resolver = Some(resolve);
                    session.pause_generation = session.pause_generation.wrapping_add(1);
                    session.pause_generation
                };
                let expired = target.clone();
                let callback = Closure::once_into_js(move || {
                    let mut session = expired.borrow_mut();
                    if session.pause_generation == generation {
                        if let Some(resolve) = session.pause_resolver.take() {
                            let _ = resolve.call1(&JsValue::UNDEFINED, &JsValue::FALSE);
                        }
                    }
                });
                if let Err(error) = web_sys::window()
                    .unwrap()
                    .set_timeout_with_callback_and_timeout_and_arguments_0(
                        callback.unchecked_ref(),
                        milliseconds.clamp(0, 60_000),
                    )
                {
                    report(error);
                }
            })
        },
    );
    Reflect::set(&host, &"pause".into(), pause.as_ref())?;
    pause.forget();
    let notify =
        Closure::<dyn FnMut(i32, i32, i32, String, String)>::new(|_event, _a, _b, _one, _two| {});
    Reflect::set(&host, &"notify".into(), notify.as_ref())?;
    notify.forget();
    Reflect::set(&js_sys::global(), &"brogueHost".into(), &host)?;
    Ok(())
}
fn install_inputs(state: &Shared) -> Result<(), JsValue> {
    let target = state.clone();
    listen::<KeyboardEvent>(document().as_ref(), "keydown", move |event| {
        if event.is_composing() || event.meta_key() || event.alt_key() {
            return;
        }
        if event.target().is_some_and(|target| {
            target.dyn_ref::<HtmlInputElement>().is_some()
                || target.dyn_ref::<HtmlSelectElement>().is_some()
        }) {
            return;
        }
        if let Some(code) = keycode(&event.key(), event.shift_key()) {
            event.prevent_default();
            send(
                &target,
                key_event(code, event.ctrl_key(), event.shift_key()),
            );
        }
    })?;
    let target = state.clone();
    listen::<Event>(element("controls").as_ref(), "click", move |event| {
        let Some(button) = event
            .target()
            .and_then(|target| target.dyn_into::<Element>().ok())
            .and_then(|element| element.closest("button[data-key]").ok().flatten())
        else {
            return;
        };
        if let Some(code) = button
            .get_attribute("data-key")
            .and_then(|code| code.parse::<i32>().ok())
        {
            send(&target, key_event(code, false, (65..=90).contains(&code)));
        }
    })?;
    let target = state.clone();
    listen::<Event>(element("display-mode").as_ref(), "change", move |_event| {
        let value = element("display-mode")
            .unchecked_into::<HtmlSelectElement>()
            .value();
        let result = (|| {
            let mut session = target.borrow_mut();
            session.presentation.mode = Mode::parse(&value).map_err(failure)?;
            session.selected_mode = value;
            draw(&mut session)
        })();
        if let Err(error) = result {
            report(error);
        }
    })?;
    let target = state.clone();
    listen::<Event>(element("zoom").as_ref(), "change", move |_event| {
        let value = element("zoom")
            .unchecked_into::<HtmlSelectElement>()
            .value();
        let mut session = target.borrow_mut();
        session.preferred_zoom = value.clone();
        set_zoom(&mut session, &value);
        if let Err(error) = draw(&mut session) {
            report(error);
        }
    })?;
    let target = state.clone();
    listen::<Event>(element("center-player").as_ref(), "click", move |_event| {
        center_player(&mut target.borrow_mut())
    })?;
    let target = state.clone();
    listen::<Event>(element("text-entry").as_ref(), "submit", move |event| {
        event.prevent_default();
        let input: HtmlInputElement = element("text-value").unchecked_into();
        send_text(&target, &input.value());
        input.set_value("");
    })?;
    let target = state.clone();
    listen::<Event>(element("erase-text").as_ref(), "click", move |_event| {
        let mut session = target.borrow_mut();
        if session.wait.kind != WaitKind::Text {
            return;
        }
        let limit = session.wait.max_length.min(4096);
        session
            .pending
            .extend((0..limit).map(|_| key_event(127, false, false)));
        if let (Some(resolve), Some(event)) =
            (session.event_resolver.take(), session.pending.pop_front())
        {
            let _ = resolve.call1(&JsValue::UNDEFINED, &Int32Array::from(event.as_slice()));
        }
    })?;
    let down = Rc::new(RefCell::new(None::<(f64, f64)>));
    let pointer = down.clone();
    listen::<PointerEvent>(element("game").as_ref(), "pointerdown", move |event| {
        if event.button() == 0 {
            *pointer.borrow_mut() = Some((event.client_x() as f64, event.client_y() as f64));
        }
    })?;
    let pointer = down.clone();
    listen::<PointerEvent>(element("game").as_ref(), "pointercancel", move |_event| {
        pointer.borrow_mut().take();
    })?;
    let target = state.clone();
    listen::<PointerEvent>(element("game").as_ref(), "pointerup", move |event| {
        let Some((x, y)) = down.borrow_mut().take() else {
            return;
        };
        if (event.client_x() as f64 - x).abs() + (event.client_y() as f64 - y).abs() > 12. {
            return;
        }
        let session = target.borrow();
        let rect = session.canvas.get_bounding_client_rect();
        let col =
            ((event.client_x() as f64 - rect.left()) / rect.width() * COLS as f64).floor() as i32;
        let row =
            ((event.client_y() as f64 - rect.top()) / rect.height() * ROWS as f64).floor() as i32;
        drop(session);
        if (0..COLS as i32).contains(&col) && (0..ROWS as i32).contains(&row) {
            send_pointer_click(&target, col, row, event.ctrl_key(), event.shift_key());
        }
    })?;
    let target = state.clone();
    listen::<Event>(element("game").as_ref(), "contextmenu", move |event| {
        event.prevent_default();
        send(&target, key_event(27, false, false));
    })?;
    let target = state.clone();
    listen::<Event>(
        web_sys::window().unwrap().as_ref(),
        "resize",
        move |_event| {
            if element("zoom")
                .unchecked_into::<HtmlSelectElement>()
                .value()
                == "fit"
            {
                let mut session = target.borrow_mut();
                set_zoom(&mut session, "fit");
                if let Err(error) = draw(&mut session) {
                    report(error);
                }
            }
        },
    )?;
    let target = state.clone();
    listen::<Event>(
        web_sys::window().unwrap().as_ref(),
        "pagehide",
        move |_event| {
            if let Err(error) = persist_files(&mut target.borrow_mut()) {
                report(error);
            }
        },
    )?;
    let target = state.clone();
    listen::<Event>(element("load-save").as_ref(), "click", move |_event| {
        let name = element("save-files")
            .unchecked_into::<HtmlSelectElement>()
            .value();
        if !safe_filename(&name) {
            return;
        }
        if let Err(error) = persist_files(&mut target.borrow_mut()) {
            report(error);
            return;
        }
        let query = web_sys::UrlSearchParams::new().unwrap();
        query.set("load", &name);
        let lang = web_sys::UrlSearchParams::new_with_str(
            &web_sys::window()
                .unwrap()
                .location()
                .search()
                .unwrap_or_default(),
        )
        .unwrap()
        .get("lang")
        .unwrap_or_else(|| "ja".into());
        query.set("lang", &lang);
        if let Err(error) = web_sys::window()
            .unwrap()
            .location()
            .set_search(&query.to_string().as_string().unwrap_or_default())
        {
            report(error);
        }
    })?;
    Ok(())
}

fn create_window() -> Result<(), JsValue> {
    document().body().unwrap().set_inner_html(r#"
<main id="brogue-app"><header><strong>Brogue 日本語</strong>
<label>表示 <select id="display-mode"><option value="original">オリジナル</option><option value="dot">ドット絵</option><option value="illustration">イラスト</option></select></label>
<label>倍率 <select id="zoom"><option value="fit">全体</option><option value="10">小</option><option value="14" selected>標準</option><option value="18">大</option><option value="24">特大</option></select></label>
<button id="center-player" type="button">＠</button><a href="https://github.com/cacazu/roguelike-nihon/tree/codex/brogue-web-common-rust/brogue-nihon" target="_blank" rel="noopener">GitHub</a></header>
<section id="mobile-summary"><pre id="mobile-messages"></pre><canvas id="mobile-sidebar" aria-label="状態"></canvas></section>
<div id="viewport"><canvas id="game" tabindex="0" aria-label="Brogue"></canvas></div>
<div id="controls"><div id="directions" aria-label="方向">
<button data-key="121">↖</button><button data-key="107">↑</button><button data-key="117">↗</button>
<button data-key="104">←</button><button data-key="46">・</button><button data-key="108">→</button>
<button data-key="98">↙</button><button data-key="106">↓</button><button data-key="110">↘</button></div>
<div id="command-area"><div id="commands">
<button data-key="105">持ち物 I</button><button data-key="97">使う A</button><button data-key="101">装備 E</button>
<button data-key="114">外す R</button><button data-key="116">投げる T</button><button data-key="100">置く D</button>
<button data-key="120">探索 X</button><button data-key="122">休息 Z</button><button data-key="62">降りる &gt;</button>
<button data-key="60">上る &lt;</button><button data-key="83">保存 S</button><button data-key="63">？</button>
<button data-key="2000">日本語 / English</button></div><div id="choices"></div>
<div id="actions"><button id="submit" data-key="10">Enter</button><button id="cancel" data-key="27">Esc</button><button data-key="9">Tab</button></div>
<form id="text-entry" hidden><input id="text-value" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="入力"><button type="submit">Enter</button><button id="erase-text" type="button">全消去</button></form></div></div>
<footer><select id="save-files" aria-label="保存済みゲーム"></select><button id="load-save">再開</button><span id="status" role="status"></span></footer></main>"#);
    Ok(())
}

#[wasm_bindgen]
pub async fn start_browser(game: JsValue) -> Result<JsValue, JsValue> {
    create_window()?;
    status("読み込み中");
    let text = bytes("/web/assets/fonts/NotoSansJP.ttf").await?;
    let emoji = bytes("/web/assets/fonts/NotoColorEmoji.ttf").await?;
    let dot = bytes("/web/assets/dot-tiles.png").await?;
    let illustration = bytes("/web/assets/illustrations.png").await?;
    let presentation = Presentation::new(text, emoji, &dot, &illustration).map_err(failure)?;
    initialize_files(&game)?;
    let canvas: HtmlCanvasElement = element("game").dyn_into()?;
    let context: CanvasRenderingContext2d = canvas
        .get_context("2d")?
        .ok_or_else(|| failure("Canvas 2D is unavailable"))?
        .dyn_into()?;
    let viewport: HtmlElement = element("viewport").dyn_into()?;
    let state = Rc::new(RefCell::new(Session {
        game,
        presentation,
        canvas,
        context,
        viewport,
        wait: Wait::default(),
        event_resolver: None,
        pause_resolver: None,
        pause_generation: 0,
        pending: VecDeque::new(),
        revision: 0,
        last_saved: String::new(),
        centered: false,
        selected_mode: "original".into(),
        preferred_zoom: "14".into(),
    }));
    install_host(&state)?;
    install_inputs(&state)?;
    update_controls(&state)?;
    {
        let mut session = state.borrow_mut();
        if session.viewport.client_width() >= 900 {
            session.preferred_zoom = "fit".into();
            set_zoom(&mut session, "fit");
            element("zoom")
                .unchecked_into::<HtmlSelectElement>()
                .set_value("fit");
        }
        draw(&mut session)?;
        persist_files(&mut session)?;
    }
    status("");
    let query =
        web_sys::UrlSearchParams::new_with_str(&web_sys::window().unwrap().location().search()?)?;
    let arguments = Array::new();
    arguments.push(&"--language".into());
    arguments.push(
        &query
            .get("lang")
            .filter(|s| s == "en" || s == "ja")
            .unwrap_or_else(|| "ja".into())
            .into(),
    );
    if let Some(load) = query.get("load").filter(|name| safe_filename(name)) {
        arguments.push(&"-o".into());
        arguments.push(&load.into());
    } else if let Some(seed) = query
        .get("seed")
        .filter(|seed| seed.parse::<u64>().is_ok_and(|value| value > 0))
    {
        arguments.push(&"--seed".into());
        arguments.push(&seed.into());
    }
    Ok(arguments.into())
}
