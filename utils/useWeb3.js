const HDWalletProvider = require('@truffle/hdwallet-provider');
const info = require('../config/info.json');
const Web3 = require("web3")

function useWeb3(network) {
    provider = new HDWalletProvider({
        privateKeys: [info.liquidator.key],
        providerOrUrl: info.RPC[network],
        numberOfAddresses: 1,
        pollingInterval: 60000
        })
    
    return new Web3(provider) 
}

module.exports = useWeb3
