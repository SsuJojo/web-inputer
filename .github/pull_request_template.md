## Summary / 摘要

<!-- What changed and why? Keep this focused on user-visible behavior or maintenance value. -->

## Scope / 范围

<!-- List the key files or areas changed. Note anything deliberately left out. -->

## Validation / 验证

<!-- Replace unchecked items with the checks you actually ran. -->

- [ ] `python -m compileall app`
- [ ] `pytest`
- [ ] `pnpm --dir frontend build` (when frontend code changes)
- [ ] Manual smoke test, including the affected browser or Windows flow
- [ ] `git diff --check`

## Security and compatibility / 安全与兼容性

- [ ] No secrets, real domains, tunnel credentials, or user data were added to the repository.
- [ ] Configuration remains in `.env` or another documented local-only mechanism.
- [ ] I considered Windows privilege/session boundaries and remote-control safety where relevant.

## Risk and rollback / 风险与回滚

<!-- State the main risk and the simplest rollback path. Write “Low risk; documentation only” when applicable. -->
