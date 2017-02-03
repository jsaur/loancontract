module.exports = function(deployer) {
  //It's a bit strange that I have to define my constructor args here
  //@todo I need a way to generate multiple loan contracts 
  deployer.deploy(LoanContractFactory);
};
