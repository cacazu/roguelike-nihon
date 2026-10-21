//! Browser APIs and lifetime management. No game state is inferred from screen text.
use crate::{
    files::{persisted_filename, saved_game_filename, validate_capacity, validate_file_size},
    input::{InputEvent, Wait, WaitKind, key_event, keycode, physical_keycode, touch_key_event},
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
    pause_mouse_interrupt: bool,
    hover_cell: Option<(i32, i32)>,
    touch_control: bool,
    touch_shift: bool,
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
        validate_capacity(saved.len(), 0).map_err(failure)?;
        let envelope: Value = serde_json::from_str(&saved).map_err(failure)?;
        if envelope["version"] != 1 || envelope["game"] != "BrogueCE1.15.1" {
            return Err(failure("Unsupported Brogue save container"));
        }
        let files = envelope["files"]
            .as_array()
            .ok_or_else(|| failure("Invalid Brogue save files"))?;
        validate_capacity(saved.len(), files.len()).map_err(failure)?;
        // Validate the whole container before mutating the fresh filesystem.
        let mut validated = Vec::new();
        for file in files {
            let name = file["name"]
                .as_str()
                .filter(|name| persisted_filename(name))
                .ok_or_else(|| failure("Invalid saved filename"))?;
            let values = file["bytes"]
                .as_array()
                .ok_or_else(|| failure("Invalid saved file size"))?;
            validate_file_size(values.len()).map_err(failure)?;
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
        .filter(|name| persisted_filename(name))
    {
        let data = Uint8Array::new(&call(&fs, "readFile", &[name.clone().into()])?).to_vec();
        validate_file_size(data.len()).map_err(failure)?;
        if name.ends_with(".broguesave") {
            saves.push(name.clone());
        }
        files.push(json!({"name":name,"bytes":data}));
    }
    let file_count = files.len();
    let saved = json!({"version":1,"game":"BrogueCE1.15.1","files":files}).to_string();
    validate_capacity(saved.len(), file_count).map_err(failure)?;
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
        if event[0] == 5 && !session.pause_mouse_interrupt {
            session.pause_resolver = Some(resolve);
            session.pending.retain(|queued| queued[0] != 5);
            session.pending.push_back(event);
            return;
        }
        session.pending.retain(|queued| queued[0] != 5);
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
fn send_pointer_click(state: &Shared, col: i32, row: i32, control: bool, shift: bool, right: bool) {
    let mut session = state.borrow_mut();
    if session.event_resolver.is_none() && session.pause_resolver.is_none() {
        return;
    }
    session.pending.retain(|event| event[0] != 5);
    for kind in if right { [3, 4] } else { [2, 1] } {
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
    visible(
        "commands",
        matches!(wait.kind, WaitKind::Command | WaitKind::Cursor),
    );
    visible(
        "directions",
        matches!(
            wait.kind,
            WaitKind::Command | WaitKind::Target | WaitKind::Cursor
        ),
    );
    visible("text-entry", wait.kind == WaitKind::Text);
    visible("cancel", wait.cancel);
    visible("tab-action", wait.allows(9));
    visible(
        "modifiers",
        matches!(
            wait.kind,
            WaitKind::Command | WaitKind::Cursor | WaitKind::Target | WaitKind::Playback
        ),
    );
    visible(
        "submit",
        matches!(wait.kind, WaitKind::Target | WaitKind::Cursor),
    );
    element("choices").set_inner_html("");
    if !matches!(
        wait.kind,
        WaitKind::Command | WaitKind::Text | WaitKind::Target | WaitKind::Cursor
    ) {
        for code in &wait.keys {
            if *code == 27 && wait.cancel {
                continue;
            }
            let playback_label = if wait.kind == WaitKind::Playback {
                let label = match *code {
                    32 => "再生 / 停止",
                    104 => "前のターン",
                    108 => "次のターン",
                    107 => "速く",
                    106 => "遅く",
                    48 => "ターンへ移動",
                    60 => "前の階",
                    62 => "次の階",
                    105 => "持ち物",
                    68 => "識別一覧",
                    70 => "実績",
                    77 => "履歴",
                    63 => "再生ヘルプ",
                    86 => "別の録画",
                    79 => "ゲーム再開",
                    81 => "再生を終了",
                    92 => "色",
                    93 => "隠密範囲",
                    71 => "表示切替",
                    126 => "シード",
                    80 => "操作を引き継ぐ",
                    _ => continue,
                };
                Some(label)
            } else {
                None
            };
            let button = document().create_element("button")?;
            button.set_attribute("type", "button")?;
            button.set_attribute("data-key", &code.to_string())?;
            let label = if let Some(label) = playback_label {
                label.into()
            } else {
                match *code {
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
                }
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
            // Native SDL retains the event that interrupted a pause until the
            // next input owner consumes it. A descriptor change must not drop
            // that event (or the up half of a validated pointer gesture).
            if !matches!(
                wait.kind,
                WaitKind::Command | WaitKind::Cursor | WaitKind::Target | WaitKind::Playback
            ) {
                session.touch_control = false;
                session.touch_shift = false;
                element("control-key").set_attribute("aria-pressed", "false")?;
                element("shift-key").set_attribute("aria-pressed", "false")?;
            }
            element("text-value")
                .unchecked_into::<HtmlInputElement>()
                .set_value("");
            let modal = !matches!(
                wait.kind,
                WaitKind::Command | WaitKind::Target | WaitKind::Cursor | WaitKind::Playback
            );
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
                WaitKind::Command | WaitKind::Target | WaitKind::Cursor | WaitKind::Playback => {
                    session.presentation.player_cell().unwrap_or((50, 17))
                }
                WaitKind::Item => (84, 8),
                // Native confirm() draws a COLS/3-wide textbox at COLS/3.
                // Center that box so its first words fit a narrow viewport.
                WaitKind::Confirm => (COLS / 2, ROWS / 2),
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
fn focus_game(session: &Session) {
    let _ = session.canvas.focus();
}
fn cycle_mode(session: &mut Session) -> Result<(), JsValue> {
    let (mode, value) = match session.presentation.mode {
        Mode::Original => (Mode::Dot, "dot"),
        Mode::Dot => (Mode::Illustration, "illustration"),
        Mode::Illustration => (Mode::Original, "original"),
    };
    session.presentation.mode = mode;
    session.selected_mode = value.into();
    element("display-mode")
        .unchecked_into::<HtmlSelectElement>()
        .set_value(value);
    draw(session)
}
fn step_zoom(session: &mut Session, larger: bool) -> Result<(), JsValue> {
    let current = session.presentation.cell_width;
    let next = if larger {
        [10, 14, 18, 24].into_iter().find(|value| *value > current)
    } else {
        [24, 18, 14, 10].into_iter().find(|value| *value < current)
    };
    let Some(next) = next else {
        return Ok(());
    };
    let value = next.to_string();
    session.preferred_zoom = value.clone();
    set_zoom(session, &value);
    element("zoom")
        .unchecked_into::<HtmlSelectElement>()
        .set_value(&value);
    draw(session)
}
fn toggle_fullscreen() -> Result<(), JsValue> {
    let document = document();
    if document.fullscreen_element().is_some() {
        document.exit_fullscreen();
    } else {
        document.document_element().unwrap().request_fullscreen()?;
    }
    Ok(())
}
fn screenshot(session: &Session) -> Result<(), JsValue> {
    let png = session.canvas.to_data_url_with_type("image/png")?;
    if !png.starts_with("data:image/png;base64,") {
        return Err(failure("PNG encoding failed"));
    }
    // A data URL is scoped to this detached anchor; no object URL is allocated.
    let anchor = document().create_element("a")?;
    anchor.set_attribute("href", &png)?;
    let stamp = js_sys::Date::new_0()
        .to_iso_string()
        .as_string()
        .unwrap_or_default()
        .replace([':', '.'], "-");
    anchor.set_attribute("download", &format!("Brogue-{stamp}.png"))?;
    document().body().unwrap().append_child(&anchor)?;
    anchor.unchecked_ref::<HtmlElement>().click();
    anchor.remove();
    status("PNGのダウンロードを開始しました");
    Ok(())
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
        move |milliseconds: i32, mouse: bool, descriptor: Int32Array| {
            if let Err(error) = receive_wait(&target, descriptor) {
                return Promise::reject(&error);
            }
            let target = target.clone();
            Promise::new(&mut move |resolve, _reject| {
                let generation = {
                    let mut session = target.borrow_mut();
                    session.pause_mouse_interrupt = mouse;
                    if session.pending.iter().any(|event| event[0] != 5 || mouse) {
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
    let target = state.clone();
    let capture = Closure::<dyn FnMut() -> bool>::new(move || match screenshot(&target.borrow()) {
        Ok(()) => true,
        Err(error) => {
            report(error);
            false
        }
    });
    Reflect::set(&host, &"screenshot".into(), capture.as_ref())?;
    capture.forget();
    Reflect::set(&js_sys::global(), &"brogueHost".into(), &host)?;
    Ok(())
}
fn install_inputs(state: &Shared) -> Result<(), JsValue> {
    let target = state.clone();
    listen::<KeyboardEvent>(document().as_ref(), "keydown", move |event| {
        if event.is_composing() || event.meta_key() {
            return;
        }
        if event.alt_key() {
            if event.key() == "Enter" {
                event.prevent_default();
                if let Err(error) = toggle_fullscreen() {
                    report(error);
                }
            }
            return;
        }
        if event
            .target()
            .is_some_and(|value| value.dyn_ref::<HtmlInputElement>().is_some())
        {
            if event.key() == "Escape" && target.borrow().wait.kind == WaitKind::Text {
                event.prevent_default();
                send(&target, key_event(27, false, false));
                focus_game(&target.borrow());
            }
            return;
        }
        if event
            .target()
            .is_some_and(|target| target.dyn_ref::<HtmlSelectElement>().is_some())
        {
            return;
        }
        let kind = target.borrow().wait.kind;
        if matches!(
            kind,
            WaitKind::Command | WaitKind::Cursor | WaitKind::Playback
        ) {
            if event.key() == "G" {
                event.prevent_default();
                if let Err(error) = cycle_mode(&mut target.borrow_mut()) {
                    report(error);
                }
                return;
            }
            if matches!(event.key().as_str(), "PageUp" | "PageDown") {
                event.prevent_default();
                if let Err(error) = step_zoom(&mut target.borrow_mut(), event.key() == "PageUp") {
                    report(error);
                }
                return;
            }
        }
        let code = if kind == WaitKind::Text {
            keycode(&event.key(), event.shift_key())
        } else {
            physical_keycode(&event.key(), &event.code(), event.shift_key())
        };
        if let Some(code) = code {
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
            if code == 71 && target.borrow().wait.kind == WaitKind::Playback {
                if let Err(error) = cycle_mode(&mut target.borrow_mut()) {
                    report(error);
                }
                return;
            }
            let (kind, control, shift) = {
                let session = target.borrow();
                (
                    session.wait.kind,
                    session.touch_control,
                    session.touch_shift,
                )
            };
            send(&target, touch_key_event(kind, code, control, shift));
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
        focus_game(&target.borrow());
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
        focus_game(&session);
    })?;
    let target = state.clone();
    listen::<Event>(element("center-player").as_ref(), "click", move |_event| {
        center_player(&mut target.borrow_mut())
    })?;
    listen::<Event>(element("fullscreen").as_ref(), "click", move |_event| {
        if let Err(error) = toggle_fullscreen() {
            report(error);
        }
    })?;
    for (id, control) in [("control-key", true), ("shift-key", false)] {
        let target = state.clone();
        listen::<Event>(element(id).as_ref(), "click", move |_event| {
            let mut session = target.borrow_mut();
            let value = if control {
                session.touch_control = !session.touch_control;
                session.touch_control
            } else {
                session.touch_shift = !session.touch_shift;
                session.touch_shift
            };
            let _ = element(id).set_attribute("aria-pressed", if value { "true" } else { "false" });
        })?;
    }
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
    let down = Rc::new(RefCell::new(None::<(f64, f64, i16)>));
    let pointer = down.clone();
    listen::<PointerEvent>(element("game").as_ref(), "pointerdown", move |event| {
        if event.button() == 0 || event.button() == 2 {
            *pointer.borrow_mut() = Some((
                event.client_x() as f64,
                event.client_y() as f64,
                event.button(),
            ));
        }
    })?;
    let pointer = down.clone();
    listen::<PointerEvent>(element("game").as_ref(), "pointercancel", move |_event| {
        pointer.borrow_mut().take();
    })?;
    let target = state.clone();
    listen::<PointerEvent>(element("game").as_ref(), "pointermove", move |event| {
        if event.pointer_type() != "mouse" || event.buttons() != 0 {
            return;
        }
        let mut session = target.borrow_mut();
        let rect = session.canvas.get_bounding_client_rect();
        let col =
            ((event.client_x() as f64 - rect.left()) / rect.width() * COLS as f64).floor() as i32;
        let row =
            ((event.client_y() as f64 - rect.top()) / rect.height() * ROWS as f64).floor() as i32;
        if !(0..COLS as i32).contains(&col)
            || !(0..ROWS as i32).contains(&row)
            || session.hover_cell == Some((col, row))
        {
            return;
        }
        session.hover_cell = Some((col, row));
        drop(session);
        send(
            &target,
            [
                5,
                col,
                row,
                i32::from(event.ctrl_key()),
                i32::from(event.shift_key()),
            ],
        );
    })?;
    let target = state.clone();
    listen::<PointerEvent>(element("game").as_ref(), "pointerleave", move |_event| {
        target.borrow_mut().hover_cell = None;
    })?;
    let target = state.clone();
    listen::<PointerEvent>(element("game").as_ref(), "pointerup", move |event| {
        let Some((x, y, button)) = down.borrow_mut().take() else {
            return;
        };
        if event.button() != button
            || (event.client_x() as f64 - x).abs() + (event.client_y() as f64 - y).abs() > 12.
        {
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
            send_pointer_click(
                &target,
                col,
                row,
                event.ctrl_key(),
                event.shift_key(),
                button == 2,
            );
        }
    })?;
    listen::<Event>(element("game").as_ref(), "contextmenu", move |event| {
        event.prevent_default();
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
        if !saved_game_filename(&name) {
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
<button id="center-player" type="button">＠</button><button id="fullscreen" type="button">全画面</button><a href="https://github.com/cacazu/roguelike-nihon/tree/codex/brogue-web-common-rust/brogue-nihon" target="_blank" rel="noopener">GitHub</a></header>
<section id="mobile-summary"><pre id="mobile-messages"></pre><canvas id="mobile-sidebar" aria-label="状態"></canvas></section>
<div id="viewport"><canvas id="game" tabindex="0" aria-label="Brogue"></canvas></div>
<div id="controls"><div id="directions" aria-label="方向">
<button data-key="121">↖</button><button data-key="107">↑</button><button data-key="117">↗</button>
<button data-key="104">←</button><button data-key="46">・</button><button data-key="108">→</button>
<button data-key="98">↙</button><button data-key="106">↓</button><button data-key="110">↘</button></div>
<div id="command-area"><div id="commands">
<button data-key="105">持ち物 I</button><button data-key="97">使う A</button><button data-key="101">装備 E</button>
<button data-key="114">外す R</button><button data-key="116">投げる T</button><button data-key="100">置く D</button>
<button data-key="120">探索 X</button><button data-key="115">探す s</button><button data-key="65">自動プレイ A</button><button data-key="122">休息 Z</button><button data-key="62">降りる &gt;</button>
<button data-key="60">上る &lt;</button><button data-key="83">保存 S</button><button data-key="63">？</button>
<button data-key="2000">日本語 / English</button><button data-key="44">撮影 ,</button></div><div id="choices"></div>
<div id="modifiers"><button id="control-key" aria-pressed="false">Ctrl</button><button id="shift-key" aria-pressed="false">Shift</button></div>
<div id="actions"><button id="submit" data-key="10">Enter</button><button id="cancel" data-key="27">Esc</button><button id="tab-action" data-key="9">Tab</button></div>
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
        pause_mouse_interrupt: false,
        hover_cell: None,
        touch_control: false,
        touch_shift: false,
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
    if let Some(load) = query.get("load").filter(|name| saved_game_filename(name)) {
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
