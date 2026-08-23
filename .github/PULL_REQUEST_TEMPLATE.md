## What does this change?

<!-- What can a user do now that they could not before? -->

## Related issue

<!-- Fixes #123 -->

## Checklist

- [ ] `npm run build` passes
- [ ] Server starts and any new tool shows up in `npm run inspect`
- [ ] New tools have Zod input schemas and a clear description
- [ ] Works in **mock mode** (no credentials configured)
- [ ] No secrets, real hostnames, account IDs, or personal data added
- [ ] No patient images added — including in tests
- [ ] Anything medical carries a non-diagnostic disclaimer

## Does this change a tool's response shape?

<!-- MCP clients depend on these. Say "no" or describe the change. -->
