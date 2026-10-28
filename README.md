# Shutter Mic

A one-page shutter speed recorder for the Minolta Workbench. It runs on GitHub Pages (or straight from the files) because the Workbench itself lives in a claude.ai artifact, which isn't allowed to use the microphone.

## What it does

- Listens on a microphone, headset jack or USB sound card and catches each shot automatically (0.35 s pre-roll, the same trigger as the Workbench Shutter Tester).
- Times the shot from the curtain clicks (microphone, reliable down to 1/15) or from a light-sensor pulse (up to 1/1000).
- Offers the speed dial of every Minolta body the Workbench knows. The speed labels match the Workbench exactly.
- Keeps shots in this browser until you save them. You can also upload a recording or type a time in ms.

## Hand-off to the Workbench

1. Press **Save file** (or **Share…** on a phone). This saves `<HUB-ID>-shutter-<date>.json`, of type `minolta-workbench-shutter`, version 1.
2. In the Workbench, open **Shutter Tester** and pick the camera.
3. Under **Previous tests**, press **JSON import** and choose the file.

The shots are added to the camera's history. With "Also save the averages as a test" ticked, the file also carries one test with the per-speed averages, which shows under Previous tests. Importing the same file twice adds nothing.

## Running it

- **GitHub Pages:** in Settings → Pages, deploy from the `main` branch, folder `/ (root)`. The page is then at `https://simon-taeuber.github.io/shutter-mic/`. Pages from a private repo needs GitHub Pro; otherwise make the repo public, since it holds no personal data.
- **Locally:** run `python3 -m http.server 8000` in this folder and open `http://localhost:8000`. The microphone needs https or localhost.
- **On a phone:** open the Pages URL, then use "Add to Home screen".

## Keeping it in step with the Workbench

`js/analysis.js` is copied from the Workbench Shutter Tester (`ALL_SPEEDS`, `DIAL`, `speedsFor`, `analyse`, `makeTrace`, `drawTrace`). When the Workbench changes those, copy them here too.
