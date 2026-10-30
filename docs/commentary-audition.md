# Match commentary voice audition

The standalone `commentary-audition.html` page compares twelve complete
recordings: Adam Stone and David (British), plus Leoromero (a Latino voice speaking English), each read the same four situations, progressing
from measured tactical analysis through danger and a save to a goal call.
They are Runway stock voices. No public commentator was cloned or imitated.

The scripts use expressive delivery tags at generation time. Displayed captions
contain only the spoken sentences. Recordings are bundled locally in
`dist/audio/runway-audition/`; playing the page never requests speech generation
or consumes generation credits.
Audio is loudness-normalized to make the voice comparison more even.

The page explicitly identifies scripted audition situations. It does not insert
unverified bishop support, through balls, loose saves or corner finishes into
live match commentary. The user chooses the preferred voice before a larger
recording library is generated. Existing tactical/shot commentary selection,
Relaxed three-second eligibility and whole-sentence playback remain in place.

One shared native audio element prevents overlap. A four-call sample advances
on natural media completion, followed by a three-second gap. Duration metadata
is display-only. Stop, changing voices, individual selection and native replay
cancel pending cues; native replay during a gap cannot be interrupted by the
old queued cue. Download links provide each complete MP3 separately.

Voice-library provenance: Adam Stone `DEFpwxCUkrj3WAbTDRTZ`; David `5gLuKtB16QIQv1vuSas1`; Leoromero `E1sh1EOsnzWOSo98d7j0`. The page uses short display names Adam, David and Leo.
