# Naming Convention (Scripts)

## Script Record Naming

Similar to other customizations, script records should have clear and consistent ids. Both script files and script records can typically maintain this convention:

```text
[namespace]_[customization]_[script type]
```

Script deployments can typically use the same id as their script except when multiple deployments are needed. In that situation, a deployment-specific id should be appended after the script id.

## Naming Examples

| Script Name                     | Type       | ID                                 | Description                                    |
| ------------------------------- | ---------- | ---------------------------------- | ---------------------------------------------- |
| [BPC] Process Returned Items MR | Map Reduce | customscript_bpc_pr_create_rma_mr  | Create RMAs from returned items                |
| [BPC] Validate Returned Item UE | User Event | customscript_bpc_pr_validate_ri_ue | Validate return item record with user event    |
| [BPC] Validate Returned Item CS | Client     | customscript_bpc_pr_validate_ri_cs | Validate return item record with client script |

## Description Field

The description on the script record should include a short explanation of what the script does. You may find it helpful to include a link to the solution document on Google Drive or flow charts in LucidChart. Ensure you’re sharing the public links to these files.

## Script Files Naming

Script file names should be similar to the script records but since script names don’t have the same length limitations as script ids, you can be more verbose (package_receipt instead of pr).

Examples:

```txt
bpc_package_receipt_create_rma_mr.js - for the above MR example
bpc_package_receipt_validate_ri_cs.js - for the above CS
bpc_package_receipt_validate_ri_ue.js - for the above UE
```

Again remembering the key points:

- `bpc` to namespace the file
- A sub-namespace if needed (for the customization)
- Specific script name
- Script type

## External Libraries

External libraries must be included in the `/SuiteScripts/BPC/External Libraries` directory. This ensures that all third-party dependencies are organized and easily accessible.

Additionally, the `/SuiteScripts/BPC/config.json` file will contain references to common libraries and utilities that can be used across different scripts. These can be referenced in the `NAmdConfig` tag of your scripts to maintain consistency and avoid duplication.

```javascript
/**
 * @NAmdConfig /SuiteScripts/BPC/config.json
 */
```

[BPC SuiteCloud GitBook](https://app.gitbook.com/o/uBoYrhHmgC6W8qt36ERD/s/flcMMloY4fndt1HgEOUm/)
