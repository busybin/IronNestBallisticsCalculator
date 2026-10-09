# Iron Nest Ballistics Calculator

A static, single-page ballistics calculator for *Iron Nest*.
No backend, no build step — everything runs in the browser.

Enter distance, bearing, shell type and charge count to get the required
elevation angle and time-to-target, and keep a target queue.

## Run locally
Just open `index.html`, or serve the folder:

    npx serve .

## Deployment
Publishes as-is via GitHub Pages (branch: `main`, folder: `/`).

## Credit
Independent, compatible reimplementation of the original Iron Nest calculator
(https://iron-nest.shiru.dog/). All credit for the original design and ballistics
model goes to its author.
