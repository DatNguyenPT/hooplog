# Design techniques

Pick by what the requirement looks like, then combine. Cut volume with risk, not with guesswork.

| Requirement shape | Technique |
|---|---|
| A field or parameter with rules | Equivalence partitions + boundary values |
| Several conditions decide the outcome | Decision table |
| Statuses and allowed moves | State transition |
| Many independent options (browser, role, plan) | Pairwise |
| A business flow across screens or roles | Scenario / use case |
| Who may do what to which entity | CRUD x role matrix |
| Anything, after the above | Error guessing |

## Equivalence partitions
Split each input into classes that the system should treat the same, then test one value per class. Age 18 to 65 gives valid (18-65) and invalid (under 18, over 65, non-numeric, empty, decimal, negative). Test every invalid class once, but never two invalid inputs in one case, or you cannot tell which one was rejected.

## Boundary values
For each range test below, on and above each edge: min-1, min, min+1, max-1, max, max+1. Length 8 to 64 gives 7, 8, 9, 63, 64, 65. Apply it to lengths, counts, sizes, amounts, dates, times and page numbers. Confirm inclusive or exclusive edges from the AC, not from habit.

## Decision table
List conditions as rows and rules as columns; every column is a case. Discount example: member (Y/N) x coupon (Y/N) x order over 100 (Y/N) gives 8 rules. Merge columns only where the outcome is provably identical, and say so.

## State transition
Draw states, events and guards. Cover every allowed transition, every disallowed one (must be rejected, state unchanged), and one or two sequences. Order: Draft, Placed, Paid, Shipped, Delivered; cancel allowed up to Paid. Include "same event twice" and "event while another is in flight".

## Pairwise
With three or more parameters of several values each, build a set where every pair of values appears at least once, using a pairwise tool or hand-made orthogonal rows. Always add the known risky full combinations (oldest browser with the slowest device, admin with the largest dataset).

## Scenario / use case
Write the end-to-end journey, then the alternate and exception flows at each step. Name the actor at every step, and test the handoff between roles (requester submits, approver rejects, requester sees the reason).

## CRUD x role matrix
Rows are entities, columns are create, read, update, delete, list, export; repeat per role plus anonymous. Each cell is allowed or denied, and each denied cell is a case (including another user's record).

## Error guessing
Empty, null, whitespace only, very long text, special characters and quotes, emoji and right-to-left text, leading or trailing spaces, duplicates, double click and double submit, back button and refresh, expired session, two tabs, time zone and daylight saving, leap day, zero and negative numbers, huge numbers, concurrent edits, offline or slow network, interrupted upload.

## Test data
State exact values. Cover typical, boundary, invalid and large. Make data unique per run (timestamp or uuid suffix) so reruns do not collide. Use masked production-like data, never real customer data.

## Oracles (how you know it is right)
In order: the AC, the business rule, the spec or design, the previous behavior, a comparable product. None of them? Do not invent an expectation; log a question and mark the case "expected TBD".

## Keeping the volume sane
Rank by risk. Full coverage for P0 and P1 areas, boundaries plus one negative for P2, a smoke check for P3. State what you deliberately did not cover.
