The documentation page is located at: [https://docs.algebra.finance/](https://docs.algebra.finance/algebra-integral-documentation/algebra-integral-technical-reference/guides/plugin-development)

The `@cryptoalgebra` repo can be found here: [github/@cryptoalgebra](https://github.com/cryptoalgebra/Algebra)

The entire workflow of the plugin can be found here: ![Plugin Algebra](<Plugin Algebra.png>)

## Build

To install dependencies, you need to run the command in the root directory:
```
$ npm install
```


To compile contracts, you need to run the following command in the root directory:
```
$ npx hardhat compile
```

## Tests

Tests for plugin are run by the following command in the module folder:
```
$ npx hardhat node

$ npx hardhat test --network localhost 
```
or to run specific test suite with name `Invariants`:
```
$ npx hardhat test --grep Invariants --network localhost
```


### Coverage
To check the coverage of tests, you need to run the following command in the root directory:
```
$ SOLIDITY_COVERAGE=true npx hardhat coverage
```

## Deploy
Firstly you need to create `.env` file in the root directory of project as in `env.example`.

Follow the [Plugin Deployment](https://docs.algebra.finance/algebra-integral-documentation/algebra-integral-technical-reference/guides/plugin-deployment) docs to write a `deploy.ts` file

To deploy all modules in specific network:
```
$ npx hardhat run scripts\deploy.ts --network <network>
```
