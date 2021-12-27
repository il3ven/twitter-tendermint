package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/dgraph-io/badger/v3"
	"github.com/spf13/viper"
	abciclient "github.com/tendermint/tendermint/abci/client"
	cfg "github.com/tendermint/tendermint/config"
	"github.com/tendermint/tendermint/libs/log"
	nm "github.com/tendermint/tendermint/node"
	"github.com/tendermint/tendermint/types"
)

var homeDir string

func init() {
	flag.StringVar(&homeDir, "tm-home", "", "Path to the tendermint 'home' directory")
}

func main() {
	flag.Parse()
	if homeDir == "" {
		h, err := os.UserHomeDir()
		if err != nil {
			panic(err)
		}
		homeDir = fmt.Sprintf("%s/%s", h, ".tendermint")
	}
	config := cfg.DefaultValidatorConfig()

	config.SetRoot(homeDir)

	viper.SetConfigFile(fmt.Sprintf("%s/%s", homeDir, "config/config.toml"))
	if err := viper.ReadInConfig(); err != nil {
		panic(err)
	}
	if err := viper.Unmarshal(config); err != nil {
		panic(err)
	}
	if err := config.ValidateBasic(); err != nil {
		panic(err)
	}
	gf, err := types.GenesisDocFromFile(config.GenesisFile())
	if err != nil {
		panic(err)
	}

	db, err := badger.Open(badger.DefaultOptions("./badger"))
	if err != nil {
		panic(err)
	}
	defer db.Close()
	app := NewKVStoreApplication(db)
	acc := abciclient.NewLocalCreator(app)

	logger := log.MustNewDefaultLogger(log.LogFormatPlain, log.LogLevelWarn, false)
	node, err := nm.New(config, logger, acc, gf)
	if err != nil {
		panic(err)
	}

	node.Start()
	defer func() {
		node.Stop()
		node.Wait()
	}()

	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c
}
