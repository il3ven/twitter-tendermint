package main

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"

	"crypto/ecdsa"
	"crypto/sha256"
	"crypto/x509"

	"github.com/dgraph-io/badger/v3"
	abcitypes "github.com/tendermint/tendermint/abci/types"
)

func verifySignature(txData TxData) (bool, error) {
	pub, err := hex.DecodeString(txData.PublicKey)
	if err != nil {
		return false, err
	}

	sig, err := hex.DecodeString(txData.Signature)
	if err != nil {
		return false, err
	}

	publicKey, err := x509.ParsePKIXPublicKey(pub)
	if err != nil {
		return false, err
	}

	hash := sha256.Sum256([]byte(txData.Msg))
	mid := len(sig) / 2
	r, s := new(big.Int), new(big.Int)
	r.SetBytes(sig[:mid])
	s.SetBytes(sig[mid:])
	return ecdsa.Verify(publicKey.(*ecdsa.PublicKey), hash[:], r, s), nil
}

func (app *KVStoreApplication) isValid(tx []byte) (code uint32, errMsg string) {
	fmt.Println("Incoming tx", string(tx[:]))
	// check format
	parts := bytes.Split(tx, []byte("="))
	if len(parts) != 2 {
		return 1, "Transaction cannot be divided"
	}

	key, value := parts[0], parts[1]
	if !json.Valid(value) {
		fmt.Println("JSON is not valid", value)
		return 1, "Invalid JSON"
	}

	// check if the same key=value already exists
	err := app.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get(key)
		if err != nil && err != badger.ErrKeyNotFound {
			return err
		}
		if err == nil {
			return item.Value(func(val []byte) error {
				if bytes.Equal(val, value) {
					code = 1
				}
				return nil
			})
		}
		return nil
	})

	if err != nil {
		panic(err)
	}

	if code != 0 {
		return code, "Duplicate Key"
	}

	// new key
	var txData TxData
	json.Unmarshal(value, &txData)
	signValid, err := verifySignature(txData)
	if err != nil {
		errMsg = "Invalid Signature"
		code = 2
	}

	if signValid {
		errMsg = "Valid Signature"
		code = 0
	} else {
		errMsg = "Invalid Signature"
		code = 1
	}

	return code, errMsg
}

func (app *KVStoreApplication) CheckTx(req abcitypes.RequestCheckTx) abcitypes.ResponseCheckTx {
	code, log := app.isValid(req.Tx)
	fmt.Println("CheckTx code:", code)
	return abcitypes.ResponseCheckTx{Code: code, Log: log}
}
