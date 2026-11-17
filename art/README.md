# Art notes

How the game draws pixel art, so new art can be made to match.

## One scale for everything

Every sprite is drawn at the same size: **screen pixels per art pixel = tile size / 32**. A sprite
tile is 32 x 32 art pixels, and the tile is drawn at the size of one board cell. Because the board
fills the screen width, the scale depends on the device:

| Screen width | Tile on screen | Scale (screen pixels per art pixel) |
|---|---|---|
| 320 px phone | about 35 px | about 1.1 |
| 360 px phone | 40 px | 1.25 |
| 390 px phone | about 45 px | about 1.4 |
| 430 px phone | about 51 px | about 1.6 |
| tablet or wide desktop | 57 px (the most) | about 1.8 |
| 1280 x 800 desktop window | about 44 px | about 1.4 |

The same rate applies to the bottles on the board, the paint storage, the held mix, and the picture
that follows your finger when you drag. It is not a whole number, so art pixels show as slightly
uneven 1 and 2 pixel blocks; the browser uses hard edges (no smoothing) so they stay crisp.

If art for another place (characters, bosses) is added, it should be drawn at its size in art
pixels times the same scale, so it matches. If a picture ends up looking small, the fix is in the
picture (draw it larger inside its tile, or on a larger canvas), not a different scale.

The scale lives in one place, `src/ui/styles.css` (`--tile` and `--pixel`).

## Files

- `Paint bottle.png`: 128 x 128 pixels, a 4 x 4 grid of 32 x 32 tiles. The pictures sit inside their
  tiles with a few pixels of empty margin. Tile order (column, row, counting from 0):
  - Row 0: yellow, red, blue, grey (the four bottles)
  - Row 1: empty bottle, orange mix, green mix, purple mix
  - Row 2: column line (vertical arrow), row line (horizontal arrow), bomb (black cross), yellow clear
  - Row 3: red clear, blue clear, grey clear
