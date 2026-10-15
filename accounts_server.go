//go:build !(js && wasm)

package main

// accountsOn: the normal server can keep login cookies, so accounts work.
const accountsOn = true
