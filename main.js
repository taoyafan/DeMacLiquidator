const info = require('./config/info.json');
const Bank = require("./abi/Bank.json");
const fetch = require('node-fetch');
const { URL, URLSearchParams } = require('url');
const useWeb3 = require('./utils/useWeb3');
const schedule = require('node-schedule');
const MaxUint256 = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

// Default type of network is string
const argv = require('minimist') (process.argv.slice(2), {string: ['network']});

// Get network
let network;
if (argv['network'] === 'bsctest' || argv['network'] === 'bscmain') {
    network = argv['network'];
} else {
    // default is bsctest
    network = 'bsctest'
}
console.log(`network: ${network}\n`);

// Init web3
console.log("Init web3");
let web3 = useWeb3(network);
web3.eth.defaultAccount = info.liquidator.address;

async function getGasPrice() {
    let gasPrice = 0;

    if (network === 'bsctest') {
        console.log(`Fast gas: ${10}, (target)`);
        gasPrice = new web3.utils.BN(10 * 10**9);   // 10 GWei
    } else {
        try{
            let url = new URL(info.api.URL);
            let params = {
              "module": "gastracker",
              "action": "gasoracle",
              "apikey": info.api.key
            };
            url.search = new URLSearchParams(params).toString();
            let response = await fetch(url);
            let gasOracle = await response.json();
            if(gasOracle.status != "1" || gasOracle.message !="OK"){
                //TODO Add retry logic
            }
            console.log(`Safe gas: ${gasOracle.result.SafeGasPrice}`);
            console.log(`Propose gas: ${gasOracle.result.ProposeGasPrice}`);
            console.log(`Fast gas: ${gasOracle.result.FastGasPrice}, (target)`);
            
            gasPrice = new web3.utils.BN(parseInt(gasOracle.result.FastGasPrice) * 10**9);
        }
        catch(e){
            console.log(e)
        }
    }

    return gasPrice;
}

async function liquidateFactor(posId) {
    // TODO read from bank.
    return 6000;
}

async function getPosInfo(bank) {

    let temp = await bank.methods.posIdAndHealth(0, MaxUint256).call();
    let allPosInfo = [];
    let posNum = temp[0].length;
    console.log(`Pos num is ${posNum}`);

    for (let i = 0; i < posNum; i++) {
        let posInfo = {id: temp[0][i], health: temp[1][i]}; 
        allPosInfo[i] = posInfo;
        console.log(`pos ${allPosInfo[i].id} health: ${allPosInfo[i].health}`);
    }

    allPosInfo.sort((a, b) => b.health - a.health);
    console.log(`After sort: `)
    allPosInfo.forEach((p) => console.log(`pos ${p.id} health: ${p.health}`));
    
    return allPosInfo;
}

//
// return: bool: Whether the calling successful;
async function callFunction(method, fromAccount, name = '') {
    let gas;
    let result = true;
    name = name ? ` when calling ${name} ` : '';

    try {
        gas = await method.estimateGas({from: fromAccount});
        console.log(`Estimated gas is ${gas}`)
    } catch(e) {
        console.log(`Estimate gas failed${name}:`);
        console.log(e);
        result = false;
    }

    if (result) {
        try {
            let gasPrice = await getGasPrice();
            gas = await method.send({from: fromAccount, gasPrice: gasPrice, gas: gas});
        } catch(e) {
            console.log(`Method.send failed${name}:`);
            console.log(e);
            result = false;
        }
    }

    return result;
}

async function main() {
    console.log("start");
    
    try {
        let bank = new web3.eth.Contract(Bank.abi, info.contracts[network].bank);
        let allPosInfo = await getPosInfo(bank);

        let isLiquidated = false;
        for (let i = allPosInfo.length - 1; i >= 0; i--) {
            let minHealth = await liquidateFactor(allPosInfo[i].id);
            
            if (allPosInfo[i].health < minHealth) {
                
                await callFunction(
                    bank.methods.liquidate(allPosInfo[i].id), 
                    info.liquidator.address, 
                    `liquidate`);
                isLiquidated = true;

            } else break;   // No need to keep comparing since is ordered
        }

        if (isLiquidated) {
            console.log(`\nAfter liquidate:`);
            allPosInfo.forEach((p) => console.log(`pos ${p.id} health: ${p.health}`));
    
            console.log(`\nRead from bank again:`);
            await getPosInfo(bank);
        }

    }
    catch (e) {
        // This is where you run code if the server returns any errors
        console.log("Error: ")
        console.error(e);
    }
    
    console.log('End.');
}

let j = schedule.scheduleJob('*/1 * * * *', function(fireDate) {
    console.log('This job was supposed to run at ' + fireDate + ', but actually ran at ' + new Date());
    (async () => {  
      try {
        await main();
      } catch (e) {
        console.log(e);
      }
    }) ();
});
