# Castlelands

A medieval tile-laying game for 1–3 humans + up to 3 bots (hot-seat). Place tiles to
build cities, roads and monasteries; place followers to score points. Pure vanilla
JS + Canvas. In-game art is procedurally drawn; the CrazyGames SDK loads
separately and the game still runs if it is unavailable.

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
- `js/sdk.js` — CrazyGames HTML5 SDK v3 loader and event adapter

## Rules implemented

- 72-tile deck, edge-matching placement, free rotation
- Followers: knights (cities), robbers (roads), monks (monasteries), 7 each
- Scoring: completed city 2/tile + 2/shield, road 1/tile, monastery 9
- End of game: incomplete structures 1/tile, monastery 1 + neighbors
- Tile with no legal spot is discarded (auto-drawn replacement)
- Farmers/fields are intentionally not implemented (v2 candidate)

## CrazyGames release package

- `release/castlelands-crazygames.zip` contains only the game files, with
  `index.html` at the archive root.
- `marketing/covers/` contains the required landscape, portrait, and square
  cover images.
- `marketing/video/` contains 17.2-second silent landscape and portrait
  previews made from actual gameplay stills. `marketing/screenshots/` contains
  extra gameplay screenshots.
- `marketing/metadata.md` contains English description and controls copy
  for the Developer Portal.
- The HTML5 SDK v3 is loaded and initialized by `js/sdk.js`. Game start,
  game over, and a human victory report gameplay start, gameplay stop, and
  happy time respectively. The game remains playable when offline.

The remaining platform step is to upload the package and promotional assets
through the [Developer Portal](https://developer.crazygames.com), run its
preview/QA tool, and submit for CrazyGames review. This needs access to the
developer account. Basic Launch does not require SDK monetization; Full
Launch does require SDK integration.

Optional later additions: fields/farmers, in-game tutorial, sound, and
save/resume.

## Testing done

- 80 randomized full games in-browser: zero exceptions, no meeple leaks
  (board + hand == 14), no negative scores, all games terminate.
- Manual play via automated browser: placement, rotation, meeple phase,
  bot turns, discard rule, game-over modal.
