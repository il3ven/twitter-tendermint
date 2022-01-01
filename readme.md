## How to start node?

`./twitterd --tm-home ./tendermint-home`

The node will listen for RPC calls on `http://localhost:26657`

## How to build node?

`go build -mod=mod -o twitterd`

## Brief Architecture

In this project, the ABCI app and the tendermint core are part of the same application. See https://docs.tendermint.com/v0.35/tutorials/go-built-in.html for more details.

The light node and frontend are part of the same app. That is, the client's browser communicates directly with a full node.

```
Browser --http calls--> Tendermint Core --in-app calls--> ABCI App (Business logic)
```

## How is a tweet (transaction) broadcasted?

The browser creates a transaction and sends it to the tendermint core through http calls. The tendermint core broadcasts it to the peers in the network. It also passes it to the ABCI application for verifying the transaction and implementing business logic.

#### A generic broadcast transaction call:

```sh
curl -X GET "https://rpc.cosmos.network/broadcast_tx_sync?tx=<some data>" -H "accept: application/json"
```

In this project, `<some data>` is divided into parts, `id` and `data`. The `id` is a unique id for the transaction. The `data` is a JSON object containing information about the transaction.

#### Structure of transaction data:

The `msg` contains the tweet that the user wants to broadcast. `publicKey` is derived from the private key and signature is also generated using the private key. This generation and signature happens on the browser.

```ts
{
    "publicKey": string,
    "signature": string,
    "msg": string
}
```

## How are tweets (transactions) queried?

The following API provided by the tendermint core is used.

```sh
curl -X GET "https://rpc.cosmos.network/tx_search?query=post.success='true'" -H "accept: application/json"
```
___

Note: *only for test purposes*