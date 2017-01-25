module.exports = function(deployer) {
  //It's a bit strange that I have to define my constructor args here
  //@todo I need a way to generate multiple loan contracts 
  deployer.deploy(LoanContract, "0x0f8b54f0f62cc77c14f6211fec634ec61f1a9961", 5, 100);
};
