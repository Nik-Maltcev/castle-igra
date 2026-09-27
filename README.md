# Castlelands

A medieval tile-laying game for 1–4 humans + up to 3 bots (hot-seat). Place tiles to
build cities, roads and monasteries; place followers to score points. Pure vanilla
JS + Canvas, zero external assets — all art is procedurally drawn.

> Positioning: an original game *inspired by* classic tile-laying board games.
> Name, art, and copy are original. Do **not** brand or market it using trademarks
> of existing board games (Carcassonne etc.) — that would fail CrazyGames QA / DMCA.

## Run locally

Any static file server pointed at this folder, e.g.:

```
cd castlelands
python -m http.server 8123
# open http://localhost:8123/
```

No build step, no dependencies.

## Files

- `index.html` — markup, menu, side panels
- `style.css` — dark medieval theme
- `js/tiles.js` — the 72-tile set (edges, city/road groups, monasteries, shields)
- `js/logic.js` — placement rules, connected-structure BFS, mid-game + final scoring
- `js/ai.js` — heuristic bot (simulates every placement × rotation, values
  completions and meeple spots)
- `js/render.js` — procedural canvas art, camera pan/zoom, click/hover input
- `js/main.js` — turn loop, UI panels, game over
- `js/sdk.js` — CrazyGames SDK no-op stub (real SDK is injected by the portal)

## Rules implemented

- 72-tile deck, edge-matching placement, free rotation
- Followers: knights (cities), robbers (roads), monks (monasteries), 7 each
- Scoring: completed city 2/tile + 2/shield, road 1/tile, monastery 9
- End of game: incomplete structures 1/tile, monastery 1 + neighbors
- Tile with no legal spot is discarded (auto-drawn replacement)
- Farmers/fields are intentionally not implemented (v2 candidate)

## CrazyGames submission checklist

1. [ ] Zip the folder contents (index.html at zip root) and upload via the
      [developer portal](https://developer.crazygames.com).
2. [ ] Replace `js/sdk.js` with the real CrazyGames SDK flow: call
      `SDK.game.gameplayStart()` when a match starts and `gameplayStop()` when it
      ends; `happytime()` on victory (hook already in place in `main.js`).
3. [ ] Prepare store assets: cover 16:9, screenshots 16:9 and 1080×607, icon.
4. [ ] QA expectations: responsive resize (works), no external network calls
      (true), instant load (<1 MB, true), English UI (true).
5. [ ] Optional v2: fields/farmers, in-game tutorial, sound, save/resume,
      emoji-free icons for store art.

## Testing done

- 80 randomized full games in-browser: zero exceptions, no meeple leaks
  (board + hand == 14), no negative scores, all games terminate.
- Manual play via automated browser: placement, rotation, meeple phase,
  bot turns, discard rule, game-over modal.
