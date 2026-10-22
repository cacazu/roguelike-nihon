use roguelike_common::{Image, ImageSet, Renderer};
use serde_json::{Value, json};
use std::collections::BTreeMap;

pub const COLS: usize = 100;
pub const ROWS: usize = 34;
pub const STRIDE: usize = 10;
pub const FIRST_TILE: i32 = 130;
pub const LAST_TILE: i32 = 258;
// Original SDL fontIndex mappings; only native game glyphs use these masks.
const ORIGINAL_FONT_GLYPHS: &[(i32, u32)] = &[
    (0x03df, 0x99), // charm
    (0x22cf, 0x83), // fire
    (0x2648, 0x84), // foliage and bloodwort stalk
    (0x26aa, 0x87), // ring
    (0x26b2, 0x8a), // totem
    (0x29f2, 0x8c), // bad magic
    (0x29f3, 0x8d), // good magic
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Original,
    Dot,
    Illustration,
}
impl Mode {
    pub fn parse(value: &str) -> Result<Self, &'static str> {
        match value {
            "original" => Ok(Self::Original),
            "dot" => Ok(Self::Dot),
            "illustration" => Ok(Self::Illustration),
            _ => Err("Unknown display mode"),
        }
    }
}

/// These indices are game settings; the shared renderer knows no Brogue glyphs.
pub fn illustration_index(glyph: i32) -> Option<usize> {
    Some(match glyph {
        130 => 20,
        131 => 8,
        132 => 1,
        133 => 42,
        134 => 3,
        135 => 16,
        136 => 2,
        137 => 13,
        138 => 24,
        139 => 6,
        140..=147 => 10,
        148 => 17,
        149 => 5,
        150 => 13,
        151 => 4,
        152 => 32,
        153 => 47,
        154 => 53,
        155 => 49,
        156 => 43,
        157 => 52,
        158 => 46,
        159 => 43,
        160 => 45,
        161 => 46,
        162 => 55,
        163 => 39,
        164 => 47,
        165 => 51,
        166 => 40,
        167 => 43,
        168 => 48,
        169 => 46,
        170 => 40,
        171 => 51,
        172 => 40,
        173 => 26,
        174 => 22,
        175 => 31,
        176 => 10,
        177 => 45,
        178 => 38,
        179 => 54,
        180 => 39,
        181 => 42,
        182 => 35,
        183 => 42,
        184 => 36,
        185 => 37,
        186 => 35,
        187 => 42,
        188 => 33,
        189 => 38,
        190 => 39,
        191 => 34,
        192 => 58,
        193 => 43,
        194 => 58,
        195 => 6,
        196 => 0,
        197 => 30,
        198 => 15,
        199 => 12,
        200 => 9,
        201 => 25,
        202 => 21,
        203 => 23,
        204 => 18,
        205 => 28,
        206 => 58,
        207 => 59,
        208 => 62,
        209 => 3,
        210 => 58,
        211 => 1,
        212 => 54,
        213 => 54,
        214 => 35,
        215 => 35,
        216 => 47,
        217 => 52,
        218 => 52,
        219 => 58,
        220 => 54,
        221 => 42,
        222 => 51,
        223 => 58,
        224 => 58,
        225 => 11,
        226 => 0,
        227 => 54,
        228 => 27,
        229 => 29,
        230 => 1,
        231 => 0,
        232 => 14,
        233 => 3,
        234 => 12,
        235 => 27,
        236 => 14,
        237 => 13,
        238 => 52,
        239 => 52,
        240 => 14,
        241 => 3,
        242 => 58,
        243 => 63,
        244 => 63,
        245 => 59,
        246 => 0,
        247 => 41,
        248 => 57,
        249 => 60,
        250 => 17,
        251 => 10,
        252 => 11,
        253 => 31,
        254 => 10,
        255 => 13,
        256 => 58,
        257 => 58,
        _ => return None,
    })
}

pub struct Presentation {
    pub renderer: Renderer,
    pub cells: Vec<i32>,
    pub mode: Mode,
    pub cell_width: u32,
    pub cell_height: u32,
    dot: BTreeMap<i32, Image>,
    original_font: BTreeMap<i32, Image>,
    illustrations: BTreeMap<i32, Image>,
}
impl Presentation {
    pub fn new(
        text_font: Vec<u8>,
        emoji_font: Vec<u8>,
        dot: &[u8],
        art: &[u8],
    ) -> Result<Self, String> {
        let sheet = Image::decode_png(dot)?;
        if sheet.width() != 2048 || sheet.height() != 5568 {
            return Err("Brogue tile atlas must be 2048×5568".into());
        }
        let mut sprites = BTreeMap::new();
        for glyph in FIRST_TILE..LAST_TILE {
            let index = (glyph + 126) as u32;
            sprites.insert(
                glyph,
                sheet.crop(index % 16 * 128, index / 16 * 232, 128, 232)?,
            );
        }
        // Native SDL font indices use the atlas font half. Monochrome masks
        // retain C colors and cover symbols missing from the bundled fonts.
        let mut original_font = BTreeMap::new();
        for &(unicode, index) in ORIGINAL_FONT_GLYPHS {
            original_font.insert(
                unicode,
                sheet.crop(index % 16 * 128, index / 16 * 232, 128, 232)?,
            );
        }
        drop(sheet);
        let sheet = Image::decode_png(art)?;
        let mut illustrations = BTreeMap::new();
        for glyph in FIRST_TILE..LAST_TILE {
            let index = illustration_index(glyph)
                .ok_or_else(|| format!("Missing illustration setting for glyph {glyph}"))?
                as u32;
            let x = index % 8 * sheet.width() / 8;
            let y = index / 8 * sheet.height() / 8;
            let right = (index % 8 + 1) * sheet.width() / 8;
            let bottom = (index / 8 + 1) * sheet.height() / 8;
            illustrations.insert(glyph, sheet.crop(x, y, right - x, bottom - y)?);
        }
        Ok(Self {
            renderer: Renderer::new(text_font, emoji_font)?,
            cells: vec![0; COLS * ROWS * STRIDE],
            mode: Mode::Original,
            cell_width: 14,
            cell_height: 22,
            dot: sprites,
            original_font,
            illustrations,
        })
    }
    pub fn snapshot(&mut self, cells: Vec<i32>) -> Result<bool, &'static str> {
        if cells.len() != COLS * ROWS * STRIDE {
            return Err("Wrong Brogue frame size");
        }
        let changed = self.cells != cells;
        self.cells = cells;
        Ok(changed)
    }
    pub fn player_cell(&self) -> Option<(usize, usize)> {
        self.cells
            .chunks_exact(STRIDE)
            .enumerate()
            .find(|(index, cell)| {
                cell[0] == 152 && index % COLS >= 21 && (3..32).contains(&(index / COLS))
            })
            .map(|(index, _)| index)
            .map(|index| (index % COLS, index / COLS))
    }
    pub fn size(&self) -> (u32, u32) {
        (
            COLS as u32 * self.cell_width,
            ROWS as u32 * self.cell_height,
        )
    }
    pub fn render(&mut self) -> Result<(), String> {
        let mut commands = Vec::<Value>::with_capacity(COLS * ROWS * 2);
        let mut tinted = BTreeMap::new();
        let mut original_masks = BTreeMap::new();
        let (cw, ch) = (self.cell_width, self.cell_height);
        // Paint all cell backgrounds before any foreground. A Japanese glyph
        // covers two cells and its continuation background must not erase it.
        for (index, cell) in self.cells.chunks_exact(STRIDE).enumerate() {
            let (x, y) = ((index % COLS) as u32 * cw, (index / COLS) as u32 * ch);
            let rect = json!({"x":x,"y":y,"w":cw,"h":ch});
            commands.push(json!({"op":"rect","rect":rect,"color":rgb(&cell[5..8])}));
        }
        for (index, cell) in self.cells.chunks_exact(STRIDE).enumerate() {
            let (x, y) = ((index % COLS) as u32 * cw, (index / COLS) as u32 * ch);
            let rect = json!({"x":x,"y":y,"w":cw,"h":ch});
            if cell[0] == 0x110000 || cell[1] <= 32 {
                continue;
            }
            if self.mode == Mode::Original && (FIRST_TILE..LAST_TILE).contains(&cell[0]) {
                if let Some(source) = self.original_font.get(&cell[1]) {
                    let key = format!("original:{}:{}:{}:{}", cell[1], cell[2], cell[3], cell[4]);
                    if !tinted.contains_key(&key) {
                        if !original_masks.contains_key(&cell[1]) {
                            original_masks.insert(cell[1], scale_font_mask(source, cw, ch)?);
                        }
                        tinted.insert(
                            key.clone(),
                            tint_font_mask(original_masks.get(&cell[1]).unwrap(), &cell[2..5])?,
                        );
                    }
                    commands.push(
                        json!({"op":"image","set":"brogue","image":key,"rect":rect,"pixelArt":false}),
                    );
                    continue;
                }
            }
            let sprites = match self.mode {
                Mode::Original => None,
                Mode::Dot => Some(&self.dot),
                Mode::Illustration => Some(&self.illustrations),
            };
            if let Some(source) = sprites.and_then(|images| images.get(&cell[0])) {
                let key = format!("{}:{}:{}:{}", cell[0], cell[2], cell[3], cell[4]);
                if !tinted.contains_key(&key) {
                    tinted.insert(
                        key.clone(),
                        scale_tinted(source, cw, ch, &cell[2..5], self.mode == Mode::Illustration)?,
                    );
                }
                commands.push(
                    json!({"op":"image","set":"brogue","image":key,"rect":rect,"pixelArt":false}),
                );
            } else {
                if self.mode != Mode::Original && (FIRST_TILE..LAST_TILE).contains(&cell[0]) {
                    return Err(format!("Missing configured Brogue sprite {}", cell[0]));
                }
                let glyph = char::from_u32(ui_codepoint(cell[0], cell[1] as u32))
                    .ok_or_else(|| format!("Invalid public Unicode glyph {}", cell[1]))?;
                let wide = cell[0] > 0x110000;
                let mut size = if wide {
                    f64::from(cw * 2).min(f64::from(ch))
                } else {
                    f64::from(ch) * 0.84
                };
                let text = glyph.to_string();
                let advance = f64::from(cw) * if wide { 2. } else { 1. };
                let mut measured = self.renderer.measure(&text, size, false, false).width;
                if measured > advance {
                    size *= advance / measured;
                    measured = self.renderer.measure(&text, size, false, false).width;
                }
                // The original atlas confines each symbol to its destination
                // cell. Font advance fitting preserves the glyph; clipping also
                // contains bearings and antialiasing. Shared clip pushes its
                // own scope, so one restore closes it without a separate save.
                commands.push(json!({"op":"clip","rect":{"x":x,"y":y,"w":advance,"h":ch}}));
                commands.push(json!({"op":"text","text":text,"x":f64::from(x)+(advance-measured)/2.,"y":f64::from(y)+(f64::from(ch)-size)/2.,"size":size,"color":rgb(&cell[2..5])}));
                commands.push(json!({"op":"restore"}));
            }
        }
        let mut sets = BTreeMap::from([("brogue".into(), ImageSet::new(tinted))]);
        let (width, height) = self.size();
        self.renderer
            .render(width, height, 1., &commands, &mut sets)
    }
}
fn ui_codepoint(glyph: i32, unicode: u32) -> u32 {
    // Brogue's G_LEFT_TRIANGLE labels a menu flyout. The bundled Noto fonts
    // contain U+25C0 with the same meaning, while U+1F780 is not covered.
    if glyph == 258 { 0x25c0 } else { unicode }
}
fn rgb(channels: &[i32]) -> String {
    format!(
        "#{:02x}{:02x}{:02x}",
        channel(channels[0]),
        channel(channels[1]),
        channel(channels[2])
    )
}
fn channel(value: i32) -> u8 {
    ((value.clamp(0, 100) * 255 + 50) / 100) as u8
}
// The original font sheet has opaque black backing, not an alpha channel.
// Average grayscale coverage before downsampling so thin strokes survive.
fn scale_font_mask(source: &Image, width: u32, height: u32) -> Result<Image, String> {
    let mut rgba = Vec::with_capacity((width * height * 4) as usize);
    for y in 0..height {
        let top = y * source.height() / height;
        let bottom = ((y + 1) * source.height() / height)
            .max(top + 1)
            .min(source.height());
        for x in 0..width {
            let left = x * source.width() / width;
            let right = ((x + 1) * source.width() / width)
                .max(left + 1)
                .min(source.width());
            let mut sum = 0u64;
            let mut count = 0u64;
            for sy in top..bottom {
                for sx in left..right {
                    let p = &source.rgba()[((sy * source.width() + sx) * 4) as usize..][..4];
                    let grey = *p[..3].iter().max().unwrap() as u64;
                    sum += (grey * u64::from(p[3]) + 127) / 255;
                    count += 1;
                }
            }
            rgba.extend_from_slice(&[255, 255, 255, ((sum + count / 2) / count) as u8]);
        }
    }
    Image::from_rgba(width, height, rgba)
}
fn tint_font_mask(mask: &Image, color: &[i32]) -> Result<Image, String> {
    let foreground = [channel(color[0]), channel(color[1]), channel(color[2])];
    let mut rgba = Vec::with_capacity(mask.rgba().len());
    for p in mask.rgba().chunks_exact(4) {
        rgba.extend_from_slice(&[foreground[0], foreground[1], foreground[2], p[3]]);
    }
    Image::from_rgba(mask.width(), mask.height(), rgba)
}
fn scale_tinted(
    source: &Image,
    width: u32,
    height: u32,
    color: &[i32],
    illustrated: bool,
) -> Result<Image, String> {
    let mut rgba = Vec::with_capacity((width * height * 4) as usize);
    let light = color.iter().copied().max().unwrap_or(100).clamp(0, 100);
    for y in 0..height {
        for x in 0..width {
            let sx = x * source.width() / width;
            let sy = y * source.height() / height;
            let pixel = &source.rgba()[((sy * source.width() + sx) * 4) as usize..][..4];
            for i in 0..3 {
                let factor = if illustrated {
                    light
                } else {
                    color[i].clamp(0, 100)
                };
                rgba.push((i32::from(pixel[i]) * factor / 100) as u8);
            }
            rgba.push(pixel[3]);
        }
    }
    Image::from_rgba(width, height, rgba)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Independent original-atlas 3x4 coverage, including each output box.
    // The wide magic symbols legitimately have no completely clear pixel here.
    fn original_tiny_coverage(unicode: i32) -> [u8; 12] {
        match unicode {
            0x03df => [0, 14, 0, 50, 91, 17, 13, 81, 47, 0, 27, 0],
            0x22cf => [0, 0, 0, 0, 80, 0, 35, 114, 38, 22, 0, 21],
            0x2648 => [0, 0, 0, 75, 96, 75, 55, 70, 54, 0, 14, 0],
            0x26aa => [0, 0, 0, 44, 61, 44, 59, 61, 59, 0, 0, 0],
            0x26b2 => [0, 4, 0, 67, 50, 66, 15, 98, 16, 0, 15, 0],
            0x29f2 => [14, 66, 15, 49, 68, 51, 52, 66, 53, 14, 68, 15],
            0x29f3 => [14, 66, 15, 72, 208, 77, 78, 214, 82, 14, 68, 15],
            _ => panic!("No original tiny-shape golden for {unicode:x}"),
        }
    }

    #[test]
    fn every_game_tile_has_an_explicit_illustration_setting() {
        for glyph in FIRST_TILE..LAST_TILE {
            assert!(
                illustration_index(glyph).is_some_and(|index| index < 64),
                "glyph {glyph}"
            );
        }
        assert_eq!(illustration_index(152), Some(32));
        assert_eq!(illustration_index(196), Some(0));
        assert!(illustration_index(65).is_none());
        let source = include_str!("../../src/brogue/Rogue.h");
        let block = source
            .split_once("enum displayGlyph {")
            .unwrap()
            .1
            .split_once("};")
            .unwrap()
            .0;
        let names: Vec<_> = block
            .lines()
            .map(str::trim)
            .filter(|line| line.starts_with("G_"))
            .collect();
        assert_eq!(names.len(), 131);
        assert!(names[129].starts_with("G_ORB_ALTAR"));
        assert!(names[130].starts_with("G_LEFT_TRIANGLE"));
    }
    #[test]
    fn wide_glyph_foreground_survives_the_continuation_background() {
        let assets = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../web/assets");
        let mut view = Presentation::new(
            std::fs::read(assets.join("fonts/NotoSansJP.ttf")).unwrap(),
            std::fs::read(assets.join("fonts/NotoColorEmoji.ttf")).unwrap(),
            &std::fs::read(assets.join("dot-tiles.png")).unwrap(),
            &std::fs::read(assets.join("illustrations.png")).unwrap(),
        )
        .unwrap();
        view.cells[..10].copy_from_slice(&[
            0x110000 + '日' as i32,
            '日' as i32,
            100,
            100,
            100,
            0,
            0,
            0,
            0,
            0,
        ]);
        view.cells[10..20].copy_from_slice(&[0x110000, 0, 100, 100, 100, 0, 0, 0, 0, 0]);
        view.render().unwrap();
        let width = view.size().0 as usize;
        assert!((0..view.cell_height as usize).any(|y| {
            (view.cell_width as usize..2 * view.cell_width as usize)
                .any(|x| view.renderer.rgba()[(y * width + x) * 4] > 0)
        }));
        view.cells[0] = 152;
        view.cells[(20 * COLS + 70) * STRIDE] = 152;
        assert_eq!(view.player_cell(), Some((70, 20)));
        view.cells.fill(0);
        view.cells[..10].copy_from_slice(&[258, 0x1f780, 100, 100, 100, 0, 0, 0, 0, 0]);
        view.cells[10..20].copy_from_slice(&[0, 0x10ffff, 100, 100, 100, 0, 0, 0, 0, 0]);
        view.render().unwrap();
        let cell_pixels = |column: usize| {
            (0..view.cell_height as usize)
                .flat_map(|y| {
                    let start = (y * width + column * view.cell_width as usize) * 4;
                    view.renderer.rgba()[start..start + view.cell_width as usize * 4].to_vec()
                })
                .collect::<Vec<_>>()
        };
        let triangle = cell_pixels(0);
        assert!(triangle.chunks_exact(4).any(|pixel| pixel[0] > 0));
        assert_ne!(
            triangle,
            cell_pixels(1),
            "The flyout triangle must not render as a missing glyph"
        );
    }
    #[test]
    fn glyph_changes_stay_inside_their_owned_cells() {
        let assets = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../web/assets");
        let mut view = Presentation::new(
            std::fs::read(assets.join("fonts/NotoSansJP.ttf")).unwrap(),
            std::fs::read(assets.join("fonts/NotoColorEmoji.ttf")).unwrap(),
            &std::fs::read(assets.join("dot-tiles.png")).unwrap(),
            &std::fs::read(assets.join("illustrations.png")).unwrap(),
        )
        .unwrap();
        let (column, row) = (50, 10);
        let at = (row * COLS + column) * STRIDE;
        // Include the actual touch size first: the player's white @ used to
        // paint into a dark Jelly on either side. Also cover public zoom sizes.
        for (cw, ch) in [(14, 22), (12, 18), (10, 15), (24, 37)] {
            view.cell_width = cw;
            view.cell_height = ch;
            for mode in [Mode::Original, Mode::Dot, Mode::Illustration] {
                view.mode = mode;
                for (raw, unicode, columns) in [
                    (152, '@' as i32, 1),
                    ('W' as i32, 'W' as i32, 1),
                    (0x110000 + '\u{65e5}' as i32, '\u{65e5}' as i32, 2),
                ] {
                    view.cells.fill(0);
                    for cell in view.cells.chunks_exact_mut(STRIDE) {
                        cell[5..8].copy_from_slice(&[10, 20, 30]);
                    }
                    // Later foregrounds must survive restoration of the clip.
                    for (x, y) in [(49, 10), (52, 10), (50, 9), (50, 11)] {
                        let neighbor = (y * COLS + x) * STRIDE;
                        view.cells[neighbor..neighbor + STRIDE]
                            .copy_from_slice(&[74, 74, 34, 34, 34, 10, 20, 30, 0, 0]);
                    }
                    view.cells[at..at + STRIDE]
                        .copy_from_slice(&[raw, unicode, 100, 100, 100, 10, 20, 30, 0, 0]);
                    if columns == 2 {
                        view.cells[at + STRIDE] = 0x110000;
                    }
                    let cells = view.cells.clone();
                    view.render().unwrap();
                    assert_eq!(view.cells, cells, "Rendering must not change public cells");
                    let ink = view.renderer.rgba().to_vec();
                    view.cells[at] = 0;
                    view.cells[at + 1] = 32;
                    view.render().unwrap();
                    let blank = view.renderer.rgba();
                    let width = view.size().0 as usize;
                    let (left, top) = (column * cw as usize, row * ch as usize);
                    let right = left + columns * cw as usize;
                    let bottom = top + ch as usize;
                    let mut own_ink = 0;
                    let mut continuation_ink = 0;
                    for (i, (actual, expected)) in
                        ink.chunks_exact(4).zip(blank.chunks_exact(4)).enumerate()
                    {
                        let (x, y) = (i % width, i / width);
                        if x >= left && x < right && y >= top && y < bottom {
                            if actual != expected {
                                own_ink += 1;
                                if x >= left + cw as usize {
                                    continuation_ink += 1;
                                }
                            }
                        } else {
                            assert_eq!(
                                actual, expected,
                                "Glyph {unicode} escaped its {columns} cell(s) at {cw}x{ch}, pixel {x},{y}"
                            );
                        }
                    }
                    assert!(
                        own_ink > 0,
                        "Glyph {unicode} must remain visible at {cw}x{ch}"
                    );
                    for (nx, ny) in [(52, 10), (50, 11)] {
                        assert!(
                            (ny * ch as usize..(ny + 1) * ch as usize).any(|y| {
                                (nx * cw as usize..(nx + 1) * cw as usize)
                                    .any(|x| ink[(y * width + x) * 4..][..4] != [26, 51, 77, 255])
                            }),
                            "Closing a glyph clip must retain later neighbor ink"
                        );
                    }
                    if columns == 2 {
                        assert!(
                            continuation_ink > 0,
                            "Wide Japanese glyph must retain ink in its continuation cell"
                        );
                    }
                }
            }
        }
    }
    #[test]
    fn mode_and_color_settings_are_validated() {
        assert_eq!(Mode::parse("dot"), Ok(Mode::Dot));
        assert!(Mode::parse("hybrid").is_err());
        assert_eq!(rgb(&[-1, 50, 200]), "#0080ff");
    }

    #[test]
    fn original_atlas_symbols_have_native_shapes_and_skip_missing_glyphs() {
        let assets = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../web/assets");
        let mut view = Presentation::new(
            std::fs::read(assets.join("fonts/NotoSansJP.ttf")).unwrap(),
            std::fs::read(assets.join("fonts/NotoColorEmoji.ttf")).unwrap(),
            &std::fs::read(assets.join("dot-tiles.png")).unwrap(),
            &std::fs::read(assets.join("illustrations.png")).unwrap(),
        )
        .unwrap();
        let header = include_str!("../../src/brogue/Rogue.h");
        let block = header
            .split_once("enum displayGlyph {")
            .unwrap()
            .1
            .split_once("};")
            .unwrap()
            .0;
        let names: Vec<_> = block
            .lines()
            .map(str::trim)
            .filter(|line| line.starts_with("G_"))
            .collect();
        let id = |name: &str| {
            128 + names
                .iter()
                .position(|line| line.trim_end_matches(',') == name)
                .unwrap() as i32
        };
        // Independent 14x22 coverage goldens from the original atlas's font half:
        // SDL fontIndex 83/99/8a/8c/8d/87/84, not the game-sprite half.
        // Atlas SHA256 40bb927cf8f1816f16720e7630e1d004974f7e780c9f137258ad017d554ec7af.
        // Hash all 308 grayscale coverage pixels, including transparent backing.
        // Fixed goldens must not be recomputed with the production mask helpers.
        let samples: [(&str, i32, u64); 7] = [
            ("G_FIRE", 0x22cf, 0x50ec_eea7_099a_e6f4),
            ("G_CHARM", 0x03df, 0xa1c4_10f0_6627_395a),
            ("G_TOTEM", 0x26b2, 0x4cc6_7869_1d06_7f43),
            ("G_BAD_MAGIC", 0x29f2, 0x66b2_7a0a_1231_b2c3),
            ("G_GOOD_MAGIC", 0x29f3, 0x5b43_f7a8_c140_6871),
            ("G_RING", 0x26aa, 0xce0d_d28e_86d7_d08d),
            ("G_FOLIAGE", 0x2648, 0x12e5_9257_04c6_5546),
        ];
        let white_cell = |raw, unicode| [raw, unicode, 100, 100, 100, 0, 0, 0, 0, 0];
        for (i, (name, unicode, _)) in samples.iter().enumerate() {
            for (column, row) in [(25 + 2 * i, 10), (3 + 2 * i, 8)] {
                let at = (row * COLS + column) * STRIDE;
                view.cells[at..at + STRIDE].copy_from_slice(&white_cell(id(name), *unicode));
            }
        }
        view.cells[..STRIDE].copy_from_slice(&white_cell(0, 0x10ffff));
        // Same Unicode outside the native game-glyph range remains font text.
        view.cells[2 * STRIDE..3 * STRIDE].copy_from_slice(&white_cell(0, 0x22cf));
        let cells = view.cells.clone();
        view.render().unwrap();
        assert_eq!(view.cells, cells);
        let width = view.size().0 as usize;
        let cell_pixels = |column: usize, row: usize| {
            (row * 22..(row + 1) * 22)
                .flat_map(|y| {
                    let at = (y * width + column * 14) * 4;
                    view.renderer.rgba()[at..at + 14 * 4].to_vec()
                })
                .collect::<Vec<_>>()
        };
        let missing = cell_pixels(0, 0);
        assert_eq!(
            cell_pixels(2, 0),
            missing,
            "The native-symbol mask must not replace ordinary Unicode text"
        );
        for (i, (name, _, expected)) in samples.iter().enumerate() {
            let map = cell_pixels(25 + 2 * i, 10);
            let sidebar = cell_pixels(3 + 2 * i, 8);
            assert_eq!(map, sidebar, "Native {name} changed shape in the sidebar");
            assert_ne!(map, missing, "Native {name} rendered the missing-glyph box");
            let mut coverage_hash = 0xcbf2_9ce4_8422_2325_u64;
            for pixel in map.chunks_exact(4) {
                assert_eq!(pixel[3], 255);
                assert_eq!(pixel[0], pixel[1], "{name} ignored monochrome white");
                assert_eq!(pixel[0], pixel[2], "{name} ignored monochrome white");
                coverage_hash =
                    (coverage_hash ^ u64::from(pixel[0])).wrapping_mul(0x0000_0100_0000_01b3);
            }
            assert_eq!(
                coverage_hash, *expected,
                "Native {name} must match its original atlas font shape"
            );
        }
        view.cell_width = 3;
        view.cell_height = 4;
        view.render().unwrap();
        assert_eq!(view.cells, cells);
        let width = view.size().0 as usize;
        for (i, (name, unicode, _)) in samples.iter().enumerate() {
            let expected = original_tiny_coverage(*unicode);
            for (column, row) in [(25 + 2 * i, 10), (3 + 2 * i, 8)] {
                for y in 0..4 {
                    for x in 0..3 {
                        let at = ((row * 4 + y) * width + column * 3 + x) * 4;
                        let alpha = expected[y * 3 + x];
                        assert_eq!(
                            &view.renderer.rgba()[at..at + 4],
                            &[alpha, alpha, alpha, 255],
                            "Native {name} changed original tiny coverage at {x},{y}"
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn original_aries_keeps_c_foreground_background_and_cell_bounds() {
        let assets = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../web/assets");
        let mut view = Presentation::new(
            std::fs::read(assets.join("fonts/NotoSansJP.ttf")).unwrap(),
            std::fs::read(assets.join("fonts/NotoColorEmoji.ttf")).unwrap(),
            &std::fs::read(assets.join("dot-tiles.png")).unwrap(),
            &std::fs::read(assets.join("illustrations.png")).unwrap(),
        )
        .unwrap();
        let header = include_str!("../../src/brogue/Rogue.h");
        let block = header
            .split_once("enum displayGlyph {")
            .unwrap()
            .1
            .split_once("};")
            .unwrap()
            .0;
        let names: Vec<_> = block
            .lines()
            .map(str::trim)
            .filter(|line| line.starts_with("G_"))
            .collect();
        let id = |name: &str| {
            128 + names
                .iter()
                .position(|line| line.trim_end_matches(',') == name)
                .unwrap() as i32
        };
        let mut samples = vec![
            (id("G_FOLIAGE"), 0x2648, [25, 100, 25]),
            (id("G_BLOODWORT_STALK"), 0x2648, [30, 5, 40]),
            (id("G_FOLIAGE"), 0x2648, [2, 5, 2]),
        ];
        // Ring first: the old emoji path loses the C foreground even though
        // the font covers it. The other new symbols are missing from both fonts.
        for (name, unicode) in [
            ("G_RING", 0x26aa),
            ("G_FIRE", 0x22cf),
            ("G_CHARM", 0x03df),
            ("G_TOTEM", 0x26b2),
            ("G_BAD_MAGIC", 0x29f2),
            ("G_GOOD_MAGIC", 0x29f3),
            ("G_FOLIAGE", 0x2648),
        ] {
            for color in [[100, 20, 0], [20, 60, 100]] {
                samples.push((id(name), unicode, color));
            }
        }
        let background = [26u8, 51, 77, 255]; // C percentages 10/20/30, non-black.
        for cell in view.cells.chunks_exact_mut(STRIDE) {
            cell[5..8].copy_from_slice(&[10, 20, 30]);
        }
        for (i, (glyph, unicode, color)) in samples.iter().enumerate() {
            let at = (10 * COLS + 25 + 2 * i) * STRIDE;
            view.cells[at..at + STRIDE].copy_from_slice(&[
                *glyph, *unicode, color[0], color[1], color[2], 10, 20, 30, 0, 0,
            ]);
        }
        for (cw, ch) in [(3, 4), (12, 18), (14, 22), (24, 36)] {
            view.cell_width = cw;
            view.cell_height = ch;
            view.mode = Mode::Original;
            view.render().unwrap();
            let width = view.size().0 as usize;
            let pixel = |x: usize, y: usize| &view.renderer.rgba()[(y * width + x) * 4..][..4];
            for (i, (_, unicode, color)) in samples.iter().enumerate() {
                let foreground = [channel(color[0]), channel(color[1]), channel(color[2])];
                let mut ink = 0;
                let mut clear = 0;
                let mut maximum_coverage = 0.0_f64;
                let reference = (0..3)
                    .max_by_key(|&c| (i16::from(foreground[c]) - i16::from(background[c])).abs())
                    .unwrap();
                for y in 10 * ch as usize..11 * ch as usize {
                    for x in (25 + 2 * i) * cw as usize..(26 + 2 * i) * cw as usize {
                        let p = pixel(x, y);
                        assert_eq!(p[3], 255);
                        if p == background {
                            clear += 1;
                        } else {
                            ink += 1;
                            let coverage = (f64::from(p[reference])
                                - f64::from(background[reference]))
                                / (f64::from(foreground[reference])
                                    - f64::from(background[reference]));
                            maximum_coverage = maximum_coverage.max(coverage);
                            assert!((-0.01..=1.01).contains(&coverage));
                            for c in 0..3 {
                                let expected = f64::from(background[c])
                                    + coverage
                                        * (f64::from(foreground[c]) - f64::from(background[c]));
                                assert!(
                                    (f64::from(p[c]) - expected).abs() <= 2.0,
                                    "RGB channels must share alpha for {color:?}: pixel {p:?}"
                                );
                                let low = foreground[c].min(background[c]).saturating_sub(1);
                                let high = foreground[c].max(background[c]).saturating_add(1);
                                assert!(
                                    (low..=high).contains(&p[c]),
                                    "Original symbol ignored C foreground {color:?}: pixel {p:?}"
                                );
                            }
                        }
                    }
                }
                assert!(
                    ink > 0,
                    "Original atlas symbol must have visible ink at {cw}x{ch}"
                );
                assert!(
                    maximum_coverage > 0.1,
                    "Original symbol must respond to C foreground at {cw}x{ch}: {color:?}, coverage {maximum_coverage}"
                );
                if (cw, ch) == (3, 4) {
                    let expected_clear = original_tiny_coverage(*unicode)
                        .iter()
                        .filter(|&&alpha| {
                            // Count expected background-colored pixels after
                            // source-over rounding, not just source alpha0.
                            (0..3).all(|c| {
                                let alpha = u32::from(alpha);
                                let ink = (u32::from(foreground[c]) * alpha + 127) / 255;
                                let backing =
                                    (u32::from(background[c]) * (255 - alpha) + 127) / 255;
                                ink + backing == u32::from(background[c])
                            })
                        })
                        .count();
                    assert_eq!(
                        clear, expected_clear,
                        "Tiny clear pixels must match original coverage for {unicode:x}"
                    );
                } else {
                    assert!(
                        clear > 0,
                        "Font background must stay transparent at {cw}x{ch}"
                    );
                }
            }
            for column in std::iter::once(24).chain((0..samples.len()).map(|i| 26 + 2 * i)) {
                for y in 9 * ch as usize..12 * ch as usize {
                    for x in column * cw as usize..(column + 1) * cw as usize {
                        assert_eq!(
                            pixel(x, y),
                            background,
                            "Symbol escaped its cell at {cw}x{ch}"
                        );
                    }
                }
            }
            for column in (0..samples.len()).map(|i| 25 + 2 * i) {
                for row in [9, 11] {
                    for y in row * ch as usize..(row + 1) * ch as usize {
                        for x in column * cw as usize..(column + 1) * cw as usize {
                            assert_eq!(
                                pixel(x, y),
                                background,
                                "Symbol escaped vertically at {cw}x{ch}"
                            );
                        }
                    }
                }
            }
            let original = view.renderer.rgba().to_vec();
            let cells = view.cells.clone();
            for mode in [Mode::Dot, Mode::Illustration, Mode::Original] {
                view.mode = mode;
                view.render().unwrap();
                assert_eq!(view.cells, cells);
            }
            assert_eq!(
                view.renderer.rgba(),
                original,
                "Display cycling changed the original frame"
            );
        }
    }
}
