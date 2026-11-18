# S-1 validation results

- Run: https://github.com/Wirahadi12/exponent-core/actions/runs/44296095218
- Commit: 720410e2fac2a52514addf3cee585f89293140c7
- Date (UTC): 2026-11-18T11:47:54Z
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
```

### tail of anchor-test.log (last 120 lines)
```
Deploying cluster: http://127.0.0.1:8899
Upgrade authority: ./testkp.json
Deploying program "exponent_admin"...
Program path: /home/runner/work/exponent-core/exponent-core/target/deploy/exponent_admin.so...
Program Id: 7RPG3Z933iwuoiiDywCx99wk73e8U8Nxp2JkV6p3CFLr

Signature: j7uTrawgjDwTTRo2kbBrbAxe1su5HrJqmhw27BGojMzjf2uJ16FEB1Ncpx9AVh9PFiyqmezmpMZjWx8VwPudsNT

Deploying program "exponent_core"...
Program path: /home/runner/work/exponent-core/exponent-core/target/deploy/exponent_core.so...
Program Id: 883qkyJ2zQPDJZXsjWdobMaRZkEje3VbDaHnnv4YFBgY

Signature: 4VMcjoLrS1oDLSA25Sbw23xnuD9SuRoRnxkUHhcLsmVRWxjLmFMFZXmWLJ4cCenhogEDs7ndjyvvmZjw2giz9gDc

Deploying program "mock_sy"...
Program path: /home/runner/work/exponent-core/exponent-core/target/deploy/mock_sy.so...
Program Id: 9VDhEFjTeMVTxSkGuRtCWqFTHgdK9uNRHCTAf14p5cbq

Signature: 5J3Sjs8dtMghgcFZg15AuExa5TTVZpAoYf4VjQ7gUCsqXaJFBUrkrH9kYe84q9WmZ5ACksTCmmNhaxP9rKjnT387

Deploy success
```
