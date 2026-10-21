//! Brogue-specific input and presentation. Rules, random state and saves stay in C.
#[cfg(target_arch = "wasm32")]
mod browser;
mod input;
mod presentation;

#[cfg(target_arch = "wasm32")]
pub use browser::start_browser;
