# S-1 validation results

- Run: https://github.com/Wirahadi12/exponent-core/actions/runs/44300818090
- Commit: 51d19653189c3310037b981c742e03765ec67838
- Date (UTC): 2026-11-18T14:07:03Z
- Solana CLI: solana-cli 4.0.0 (src:2a165e7a; feat:dda54cf7, client:Agave)
- Anchor CLI: anchor-cli 0.31.1

## Reproducible build (exponent_core.so vs deployed)
- Deployed sha256: dd2b8426f820ef010b2a27564c89aa38a62422183ccb45197b5377d295e8d938 (2,023,961 bytes)
- Built sha256: 85beca8ebb7f75aa8e1bfe65bfec4ed3d98e589990d5a3cbc3b2dadf193e2bc6
- Built size: 1620096 bytes
- Verdict: MISMATCH

## Anchor test (S-1 end-to-end)
```
(no S-1 VERDICT block in log)
```

### mocha summary
```
  0 passing (3s)
  6 failing
```

### tail of anchor-test.log (last 120 lines)
```
Deploying cluster: http://127.0.0.1:8899
Upgrade authority: ./testkp.json
Deploying program "exponent_admin"...
Program path: /home/runner/work/exponent-core/exponent-core/target/deploy/exponent_admin.so...
Program Id: HEfrKwChREiJEfc4AJghBLbrzJbnZ9Qv6veP1vML5mmq

Signature: 3e1jpWCuh6uZearzD5rzizhSFwcTcyYBQkKr4TGDmRyHKFZLRHdcRQtiz7Kau7QxuxWi81zQnCi73CNrj91wMHnS

Deploying program "exponent_core"...
Program path: /home/runner/work/exponent-core/exponent-core/target/deploy/exponent_core.so...
Program Id: HShz3pqYEjA4H3xZf5wag9QJh1u4wtaxzxu8BKZUMzp7

Signature: 594Pt69mz85zDxijEhqe8jSX6FEk8Esp8bQjsHTjXHLxVrkoSnAY8CEvWXWm9dPhhh9UC239pUsNkwh7Cyq3cQS3

Deploying program "mock_sy"...
Program path: /home/runner/work/exponent-core/exponent-core/target/deploy/mock_sy.so...
Program Id: 9VDhEFjTeMVTxSkGuRtCWqFTHgdK9uNRHCTAf14p5cbq

Signature: 4Z71u3yDtnWy6tCdZHVQQS3e7jq7pRwYXahVcuWyk2JXRajazP3NZ4EaEtf5q9dwsCnuRGn3UJKsWkuK35FAWg8R

Deploy success

Found a 'test' script in the Anchor.toml. Running it as a test suite!

Running test suite: "/home/runner/work/exponent-core/exponent-core/Anchor.toml"

(node:17938) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/runner/work/exponent-core/exponent-core/tests/s1_zero_supply.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/runner/work/exponent-core/exponent-core/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)


  S-1 zero LP supply
admin ready, hot admin = DKABB4BocRw9Mi1yWJRBot95wFwCkGXCUChwGYh9n88C
SY mint = FZg84oF4bww14gd6c9tEpuzuBvJ2nf6Rta9gaZm6YfHd
    1) sets up admin, SY mint, vault and lookup table
    2) strips SY into PT + YT at rate 1.0
    3) inits market (1,000,000 PT + 1,000,000 SY -> 1,000,000 LP)
    4) CONTROL: normal deposit mints LP > 0
    5) drains LP supply to zero via SPL burn
    6) S-1: deposit with zero LP supply takes SY and mints 0 LP


  0 passing (3s)
  6 failing

  1) S-1 zero LP supply
       sets up admin, SY mint, vault and lookup table:
     
  TokenOwnerOffCurveError: 
      at /home/runner/work/exponent-core/exponent-core/node_modules/@solana/spl-token/src/state/mint.ts:169:78
      at Generator.next (<anonymous>)
      at /home/runner/work/exponent-core/exponent-core/node_modules/@solana/spl-token/lib/cjs/state/mint.js:8:71
      at new Promise (<anonymous>)
      at __awaiter (node_modules/@solana/spl-token/lib/cjs/state/mint.js:4:12)
      at getAssociatedTokenAddress (node_modules/@solana/spl-token/lib/cjs/state/mint.js:132:12)
      at /home/runner/work/exponent-core/exponent-core/tests/s1_zero_supply.ts:226:52
      at Generator.next (<anonymous>)
      at fulfilled (tests/s1_zero_supply.ts:77:58)
      at processTicksAndRejections (node:internal/process/task_queues:104:5)

  2) S-1 zero LP supply
       strips SY into PT + YT at rate 1.0:
     
  TokenAccountNotFoundError: 
      at unpackAccount (node_modules/@solana/spl-token/src/state/account.ts:170:22)
      at /home/runner/work/exponent-core/exponent-core/node_modules/@solana/spl-token/src/state/account.ts:103:12
      at Generator.next (<anonymous>)
      at fulfilled (node_modules/@solana/spl-token/lib/cjs/state/account.js:5:58)
      at processTicksAndRejections (node:internal/process/task_queues:104:5)

  3) S-1 zero LP supply
       inits market (1,000,000 PT + 1,000,000 SY -> 1,000,000 LP):
     Error: Account `market` not provided.
      at /home/runner/work/exponent-core/exponent-core/node_modules/@coral-xyz/anchor/src/program/common.ts:51:15
      at Array.forEach (<anonymous>)
      at validateAccounts (node_modules/@coral-xyz/anchor/src/program/common.ts:46:14)
      at ix (node_modules/@coral-xyz/anchor/src/program/namespace/instruction.ts:44:23)
      at txFn (node_modules/@coral-xyz/anchor/src/program/namespace/transaction.ts:24:14)
      at MethodsBuilder.rpc [as _rpcFn] (node_modules/@coral-xyz/anchor/src/program/namespace/rpc.ts:21:18)
      at MethodsBuilder.rpc (node_modules/@coral-xyz/anchor/src/program/namespace/methods.ts:434:17)

  4) S-1 zero LP supply
       CONTROL: normal deposit mints LP > 0:
     TypeError: Cannot read properties of undefined (reading 'toBase58')
      at Connection.getAccountInfo (node_modules/@solana/web3.js/src/connection.ts:3623:57)

  5) S-1 zero LP supply
       drains LP supply to zero via SPL burn:
     TypeError: Cannot read properties of undefined (reading 'toBase58')
      at Connection.getAccountInfo (node_modules/@solana/web3.js/src/connection.ts:3623:57)

  6) S-1 zero LP supply
       S-1: deposit with zero LP supply takes SY and mints 0 LP:
     TypeError: Cannot read properties of undefined (reading 'toBase58')
      at Connection.getAccountInfo (node_modules/@solana/web3.js/src/connection.ts:3623:57)
      at processTicksAndRejections (node:internal/process/task_queues:104:5)



Error: No such file or directory (os error 2)
```
