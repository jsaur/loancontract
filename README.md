# Loan Contract
This is a Solidity script that can be used for multiple lenders to lend to a borrower, and allow the borrower to pay back to those lenders.

## Installation
For testing its easiest/faster to run on a private test network. You can install it from here: https://github.com/ethereumjs/testrpc
Once installed you can start the testrpc from a terminal with: testrpc

Right now the best way to interact with the contract is through Mist. You can download it here: https://github.com/ethereum/mist/releases
You can start it against your test network from a terminal with: ./opt/Mist/mist --rpc localhost:8545

The web app right now just displays events as they go past. It's built on truffle, you can install it from here: https://github.com/ConsenSys/truffle
You will need to cd into the app dir and run: bower install
Then from the main dir run: truffle serve

Note: right now we have to specify the borrowers address at deploy time, so you need to update migrations/2_deploy_contracts.js to a borrower address that exists on your testrpc

Go go localhost:8080 and you should see the contract details that you just deployed. In your Mist broswer you can now watch the contract by pasting the address and JSON interface.

You can also play around with the contract by pasting it into https://ethereum.github.io/browser-solidity
