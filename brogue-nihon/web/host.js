// Thin module/bootstrap adapter. Input, presentation and save policy live in Rust.
import init, { start_browser } from "/build/browser-ui.js";
import createBrogue from "/build/game.js";

try {
  await init();
  const game = await createBrogue({ noInitialRun: true });
  const arguments_ = await start_browser(game);
  game.callMain(Array.from(arguments_));
} catch (error) {
  document.getElementById("status").textContent = String(error);
  console.error(error);
}
