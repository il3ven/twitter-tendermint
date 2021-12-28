package main

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"

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
	return ecdsa.VerifyASN1(publicKey.(*ecdsa.PublicKey), hash[:], sig), nil
}

func (app *KVStoreApplication) isValid(tx []byte) (code uint32) {
	// check format
	parts := bytes.Split(tx, []byte("="))
	if len(parts) != 2 {
		fmt.Println("Transaction cannot be divided")
		return 1
	}

	key, value := parts[0], parts[1]
	if !json.Valid(value) {
		fmt.Println("JSON is not valid", value)
		return 1
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
					fmt.Println("Key already exists")
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
		return code
	}

	// new key
	var txData TxData
	json.Unmarshal(value, &txData)
	signValid, err := verifySignature(txData)
	if err != nil {
		fmt.Println("Error in verifySignature")
		code = 2
	}

	if signValid {
		fmt.Println("Signature Valid")
		code = 0
	} else {
		fmt.Println("Signature is not valid")
		code = 1
	}

	return code
}

func (app *KVStoreApplication) CheckTx(req abcitypes.RequestCheckTx) abcitypes.ResponseCheckTx {
	code := app.isValid(req.Tx)
	fmt.Println("CheckTx code:", code)
	return abcitypes.ResponseCheckTx{Code: code}
}
