use roguelike_common::{Image, ImageSet, Renderer};
use serde_json::{Value, json};
use std::collections::BTreeMap;

pub const COLS: usize = 100;
pub const ROWS: usize = 34;
pub const STRIDE: usize = 10;
pub const FIRST_TILE: i32 = 130;
pub const LAST_TILE: i32 = 258;

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
                let size = if wide {
                    f64::from(cw * 2).min(f64::from(ch))
                } else {
                    f64::from(ch) * 0.84
                };
                let text = glyph.to_string();
                let measured = self.renderer.measure(&text, size, false, false).width;
                let advance = f64::from(cw) * if wide { 2. } else { 1. };
                commands.push(json!({"op":"text","text":text,"x":f64::from(x)+(advance-measured)/2.,"y":f64::from(y)+(f64::from(ch)-size)/2.,"size":size,"color":rgb(&cell[2..5])}));
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
    fn mode_and_color_settings_are_validated() {
        assert_eq!(Mode::parse("dot"), Ok(Mode::Dot));
        assert!(Mode::parse("hybrid").is_err());
        assert_eq!(rgb(&[-1, 50, 200]), "#0080ff");
    }
}
