var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("LoanContract error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("LoanContract error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("LoanContract contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of LoanContract: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to LoanContract.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: LoanContract not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "default": {
    "abi": [
      {
        "constant": true,
        "inputs": [],
        "name": "currentState",
        "outputs": [
          {
            "name": "",
            "type": "uint8"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "checkExpired",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "amountLeftToFund",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "name": "lenderAddresses",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "borrowerWithdraw",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "amountLeftToRepay",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "name": "lenderAccounts",
        "outputs": [
          {
            "name": "amountLent",
            "type": "uint256"
          },
          {
            "name": "amountRepaid",
            "type": "uint256"
          },
          {
            "name": "amountWithdrawn",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "amountRaised",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "repaymentRemainder",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "lenderAddr",
            "type": "address"
          }
        ],
        "name": "amountLenderCanWithdraw",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "loanAmount",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "borrowerRepay",
        "outputs": [],
        "payable": true,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "numLenders",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "fundRaisingDeadline",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "amountRepaid",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "lenderWithdraw",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [
          {
            "name": "_borrowerAddress",
            "type": "address"
          },
          {
            "name": "loanAmountInEthers",
            "type": "uint256"
          },
          {
            "name": "fundRaisingDurationInMinutes",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "constructor"
      },
      {
        "payable": true,
        "type": "fallback"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "lenderAddr",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "LentToLoan",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "borrowerAddr",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "BorrowerWithdrew",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "borrowerAddr",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "BorrowerRepaid",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "lenderAddr",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "LenderGotRepaid",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "lenderAddr",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "LenderWithdrew",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [],
        "name": "LoanFunded",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [],
        "name": "LoanExpired",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [],
        "name": "LoanRepaid",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x606060405234610000576040516060806109868339810160409081528151602083015191909201515b60008054600160a060020a031916600160a060020a038516179055670de0b6b3a76400008202600155603c810242016002555b5050505b6109188061006e6000396000f300606060405236156100ca5763ffffffff60e060020a6000350416630c3f6acf811461026857806325ace2a714610296578063281380e8146102a55780632d6963ce146102c45780635cdb9829146102f05780635edf0c9e146102ff5780635f97a7d81461031e5780637b3e5e7b146103555780638961639e1461037457806395e72314146103935780639d585f7f146103be578063bb447706146103dd578063bb927c46146103e7578063cbc9130e14610406578063ee86afd814610425578063f14f6e1714610444575b6102665b60003411156102625760005433600160a060020a03908116911614156100f357610000565b600060095460ff1660048111610000571461010d57610000565b610115610453565b34111561012157610000565b6003805460019081019091556004805434019055600780549182018082559091908281838015829011610179576000838152602090206101799181019083015b808211156101755760008155600101610161565b5090565b5b505050916000526020600020900160005b8154600160a060020a033381166101009390930a83810291021990911617909155604080516060810182523480825260006020808401828152848601838152878452600883529286902094518555516001850155905160029093019290925582519384529083015280517f47047d86227821f4ba4162b47a4e21f3751a6898df27767881baae61a5df54b99350918290030190a16001546004541415610262576009805460ff191660011790556040517f3351ae6756a83898700959ab1a672004e55a70dd6e74a45a80835316af9c76a490600090a15b5b5b565b005b346100005761027561045e565b6040518082600481116100005760ff16815260200191505060405180910390f35b3461000057610266610467565b005b34610000576102b2610453565b60408051918252519081900360200190f35b34610000576102d46004356104aa565b60408051600160a060020a039092168252519081900360200190f35b34610000576102666104da565b005b34610000576102b26105a0565b60408051918252519081900360200190f35b3461000057610337600160a060020a03600435166105ab565b60408051938452602084019290925282820152519081900360600190f35b34610000576102b26105cc565b60408051918252519081900360200190f35b34610000576102b26105d2565b60408051918252519081900360200190f35b34610000576102b2600160a060020a03600435166105d8565b60408051918252519081900360200190f35b34610000576102b261065f565b60408051918252519081900360200190f35b610266610665565b005b34610000576102b2610839565b60408051918252519081900360200190f35b34610000576102b261083f565b60408051918252519081900360200190f35b34610000576102b2610845565b60408051918252519081900360200190f35b346100005761026661084b565b005b600454600154035b90565b60095460ff1681565b6002544210610262576009805460ff191660031790556040517f5dc919cafc7dd3f912b1ba505941b4eb1c8f4fd4bea581b22982d7d0feef549c90600090a15b5b565b600781815481101561000057906000526020600020900160005b915054906101000a9004600160a060020a031681565b60005433600160a060020a039081169116141561026257600160095460ff166004811161000057141561026257600060045411156102625760008054600454604051600160a060020a039092169281156108fc029290818181858888f1935050505015610262576009805460ff1916600217905560005460045460408051600160a060020a039093168352602083019190915280517f2dc63558fcb644e43c404fb71c2bb9005b9ee3b361d19c603821f86ded7a5bd49281900390910190a15b5b5b5b5b565b600554600154035b90565b60086020526000908152604090208054600182015460029092015490919083565b60045481565b60065481565b600160a060020a03811660009081526008602052604081208190600360095460ff16600481116100005714156106175760028101548154039150610653565b600260095460ff16600481116100005714806106405750600460095460ff166004811161000057145b1561065357806002015481600101540391505b5b8192505b5050919050565b60015481565b60008054819081908190819033600160a060020a0390811691161461068957610000565b600260095460ff166004811161000057146106a357610000565b6106ab6105a0565b3411156106b757610000565b600580543490810190915560005460408051600160a060020a039092168252602082019290925281517ffa13b775726afb945417ae4455f2c2d682da8145bcf41f4b6bba4fd5414b90e7929181900390910190a1600154600554141561074e576040517f1062e18f9d21decf38f145fc9b437cd2c70e09252a729f9830b75ffdaaf3789490600090a16009805460ff191660041790555b6006543401945060009350600092505b60075483101561082b57600783815481101561000057906000526020600020900160005b90546001546101009290920a9004600160a060020a03166000818152600860205260409020549093508602811561000057049050600081111561081f57600160a060020a0382166000818152600860209081526040918290206001018054850190558151928352820183905280517fe32f0f33dec2a8ec7551533da802315e683b231604c05ccd0dc26778d8f162aa9281900390910190a1928301925b5b60019092019161075e565b8385036006555b5050505050565b60035481565b60025481565b60055481565b6000610856336105d8565b905060008111156108e757604051600160a060020a0333169082156108fc029083906000818181858888f19350505050156108e757600160a060020a0333166000818152600860209081526040918290206002018054850190558151928352820183905280517f5eb46cc574ef1abdbd52310ce761acbb5cbd48af34b53e4f32083f205c8a977e9281900390910190a15b5b5b505600a165627a7a723058208ec3e8566fadc2ded2a20434844be9ba69535cc540d22b3812817914598067c20029",
    "events": {
      "0x47047d86227821f4ba4162b47a4e21f3751a6898df27767881baae61a5df54b9": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "lenderAddr",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "LentToLoan",
        "type": "event"
      },
      "0x2dc63558fcb644e43c404fb71c2bb9005b9ee3b361d19c603821f86ded7a5bd4": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "borrowerAddr",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "BorrowerWithdrew",
        "type": "event"
      },
      "0xfa13b775726afb945417ae4455f2c2d682da8145bcf41f4b6bba4fd5414b90e7": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "borrowerAddr",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "BorrowerRepaid",
        "type": "event"
      },
      "0xe32f0f33dec2a8ec7551533da802315e683b231604c05ccd0dc26778d8f162aa": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "lenderAddr",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "LenderGotRepaid",
        "type": "event"
      },
      "0x5eb46cc574ef1abdbd52310ce761acbb5cbd48af34b53e4f32083f205c8a977e": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "lenderAddr",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "LenderWithdrew",
        "type": "event"
      },
      "0x3351ae6756a83898700959ab1a672004e55a70dd6e74a45a80835316af9c76a4": {
        "anonymous": false,
        "inputs": [],
        "name": "LoanFunded",
        "type": "event"
      },
      "0x5dc919cafc7dd3f912b1ba505941b4eb1c8f4fd4bea581b22982d7d0feef549c": {
        "anonymous": false,
        "inputs": [],
        "name": "LoanExpired",
        "type": "event"
      },
      "0x1062e18f9d21decf38f145fc9b437cd2c70e09252a729f9830b75ffdaaf37894": {
        "anonymous": false,
        "inputs": [],
        "name": "LoanRepaid",
        "type": "event"
      }
    },
    "updated_at": 1485213667486,
    "links": {},
    "address": "0xf606caa0d17300f379424f4677d0f172a10c0505"
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "LoanContract";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.LoanContract = Contract;
  }
})();
