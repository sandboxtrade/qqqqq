# Character asset generation quick plan

Use `_HANDOFF/master-character-reference.jpeg` as Image A / master reference.

Maintain identity:
- same face structure
- same eye shape/color
- same hair
- same body proportions
- same apparent adult age
- same rendering style

Generate first:
1. master_front
2. master_3q
3. portrait_close
4. chair_01
5. sofa_01
6. bed_01
7. neutral
8. soft_smile
9. shy
10. annoyed

Recommended output: 1440×2560, 9:16. For character-only production assets, transparent PNG is preferred.

Do not generate each image independently from text. Always reference the master image so identity does not drift.
