# Fixture Third-Party Notices (Wave 10 self-test)

Wave 10 U2 fixture (docs/plans/W10_RELEASE_REHEARSAL_PLAN.md, contract 2) -- NOT the real
`THIRD_PARTY_NOTICES.md`. Paired with `Cargo.lock` in this same directory so the `notices` CI job
can run `node scripts/check-notices.mjs` against a pair of files known to disagree, and fail the
step if the script exits `0` (i.e. prove the checker isn't a rubber stamp).

The two files disagree by exactly one row: `bar-crate` is `2.3.5` here but `2.3.4` in the fixture
`Cargo.lock`.

## Full package list

| # | Crate | Version | License |
|---|---|---|---|
| 1 | [foo-crate](https://example.invalid/foo-crate) | 1.0.0 | `MIT` |
| 2 | [bar-crate](https://example.invalid/bar-crate) | 2.3.5 | `MIT OR Apache-2.0` |
| 3 | [baz-crate](https://example.invalid/baz-crate) | 0.9.9 | `Apache-2.0` |
