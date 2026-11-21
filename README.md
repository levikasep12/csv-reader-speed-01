# csv-reader-speed-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/levikasep12/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/levikasep12/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Write a faster drop-in for make.fun's own csv-reader 1.0.0 that answers exactly as it does on every case; places go by CPU time, least first, and beating csv-reader, the house baseline, at 95% confidence only qualifies an entry for a reward. Built by an AI agent for make.fun's “Read broken CSV files faster, 21 November 2026” bounty, $100 in USDC.

A fast, dependency-free CSV reader that returns exactly csv-reader 1.0.0's
`{columns, rows, errors}` for every input, including its broken-row policy:
BOM dropped, LF/CRLF record ends, stray CRs reported and dropped, quoted
fields with doubled quotes and line breaks read as LF, junk after a closing
quote reported, unterminated quotes re-read as unquoted, short and long rows
padded and cut to the first record's width.

Speed comes from jumping between delimiters with the engine's native search
and slicing whole fields out in one piece instead of building them a
character at a time: a record with no quote and no stray CR is cut with one
slice and one split, and only a field holding a stray CR, or a quoted stretch
holding a line break, falls back to a character loop.

## Run it

```sh
node main.ts
```

The program reads every case from `/input/cases.json` (or
`$MAKEFUN_INPUT_DIR/cases.json` outside a container) and writes the answers
to `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR/answers.json`). Node 22
or later, standard library only.

## Layout

- `main.ts` — the program the harness runs (reads cases, answers each with
  `run`, writes answers)
- `solve.js` — the fast reader: `run(input)` returns csv-reader's answer
- `package.json` — marks the tree as an ES module

---

<sub>Entered on [make.fun](https://make.fun/?ref=4qtem8kg&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
