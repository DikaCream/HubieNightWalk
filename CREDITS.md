# Credits

## Art
* Hubie: an original drawing made in code (SVG parts in src/hubieArt.ts) of the Housebets mascot. The official Housebets look was used for identity only (species, face mask and eye bands, top hat with the H badge, navy tailcoat, orange waistcoat and bow tie). No official artwork is traced, cut out, copied or shipped with the game.
* Everything else in the scene is procedural vector art drawn with PixiJS Graphics.

## Audio
* public/audio/rain-loop.mp3: "Rain in the Gutter Loop" by Ogrebane, OpenGameArt.org, license CC0 (public domain dedication, commercial use allowed, no attribution required).
  Source: https://opengameart.org/content/rain-gutter-loop
  Changes: high pass at 150 Hz, low pass at 9 kHz, cut to 20 seconds, crossfaded into a seamless loop, encoded to 64 kbps MP3.
* Everything else (rhodes, upright bass, brushes, ride, kick, pad, vibraphone, vinyl crackle, sound effects and stingers) is synthesised at runtime in src/sound.ts. No samples, no copyrighted recordings, no melodies taken from existing songs.

## Research that shaped the music (ideas only, no material copied)
* https://producersgpt.com/genre/lofi-hip-hop-production-guide : tempo range, swing amount, ghost snare, low pass and vinyl texture.
* https://musicproducerlab.org/blog/how-to-make-a-lofi-beat.html : kick placement off the grid, timing humanisation, quiet ghost hits.
* https://pianowithjonny.com/piano-lessons/rootless-voicings-for-piano-the-complete-guide/ : rootless A and B voicings for min9, maj9 and dom13.
* https://piano.org/theory/ninth-chords/ : minor 9th colour and voicing.
* https://www.talkbass.com/wiki/bass-line-construction-target-approach/ and https://bikashacharya.com/bass/walking.html : walking bass with target roots and chromatic approach notes.
* https://en.wikipedia.org/wiki/Adaptive_music and https://github.com/Northforge-Interactive/adaptive-music-godot : vertical layering by intensity, section changes on the bar line, stingers.
