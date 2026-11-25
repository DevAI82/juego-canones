// The musical duel's recorded songs: for each league that has one, its
// sound file and the keys written for it. tools/duel/chart_from_audio.py
// writes this file from the recordings (it finds a song's beat and puts the
// keys on its drums, its bass and its tune); don't edit it by hand.
//
// A league without one here plays the song written as notes in
// duelSongs.js.
//
//   name    the song's
//   file    the recording, among the game's assets
//   bpm     its tempo; first: s into it of the first beat of a bar
//   length  s of it that are played
//   starts  s into it where a round may start: each round of a duel starts
//           at the next one, so a duel goes through the whole song
//   notes   the keys: [s into the song, key, s to hold it (0: a tap)]
export const TRACKS = {};
