# Terminology

| Term | Meaning |
| --- | --- |
| Blank | Unlit white position with no action |
| Mark | Explicit prohibition against placing a Lamp |
| Lamp | Placed or hypothesized light |
| Lit | Illumination derived from Lamps; never an action |
| Number | Original numbered constraint; UI also shows remaining count |
| Wall | Opaque obstacle |
| Center | Selected Number or unlit coverage constraint used for one proof |
| Candidate | Unordered partial Lamp/Mark hypothesis combination |
| Brain step | One selected-center proof with productive actions |
| Fast mark | At least two independent singleton cost-one proofs on the same state |

Internal compatibility vocabulary may use `Empty`/`Clue`; visible labels use
Blank/Number. `actions` is the only authoritative action map. Historical Mark
actions remain in the log when later illuminated, but committed display becomes
Lit. Preview layers must not erase historical marks before After.

See [protocol](protocol.md) and [algorithm](algorithm.md) for full semantics.
