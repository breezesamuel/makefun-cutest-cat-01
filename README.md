# cutest-cat-01 — draw the cutest cat, all in one file

make.fun bounty: the program paints a picture of a cat to `/output/entry.png`. This entry draws
its own cat — no image file ships in the repository. Everything the judge sees is rasterised
here, at run time, by a small signed-distance-field renderer built on the Node standard
library alone:

- Every shape is a signed distance field (ellipses, capsule chains, rounded polygons), so a
  whisker or a cheek stays clean at any size.
- The canvas renders at 3x and box-filters down to 1024 by 1024 for anti-aliasing.
- `node:zlib` deflates the scanlines; the PNG chunks and their CRCs are written by hand.

The cat is deliberately simple to read small: a round cream-and-ginger kitten with one big
oversized paw on a ball of yarn, its head tilted, against a soft mint-to-blush background.
No text, no clutter.

## Run it

Standard library only — nothing is installed:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
# -> out/entry.png, 1024x1024, under 1 MiB
```

In the grader's container the same file writes to `/output/entry.png`.
