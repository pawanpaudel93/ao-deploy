# Contributing to ao-deploy

Thank you for considering contributing to ao-deploy! We welcome contributions from everyone. To ensure a smooth process, please follow the guidelines below.

## How to Contribute

### Reporting Issues

1. **Search for existing issues**: Before opening a new issue, make sure to check if the issue has already been reported.
2. **Provide detailed information**: Include a clear and concise description of the issue, steps to reproduce it, and any relevant screenshots or logs.
3. **Open an issue**: Report issues on our [issue tracker](https://github.com/pawanpaudel93/ao-deploy/issues).

### Contributing Code

1. **Fork the repository**: Create a personal copy of the repository on GitHub by forking it.
2. **Create a branch**: Make sure to create a new branch for your changes. Use a descriptive name for your branch (e.g., `fix-typo`, `add-new-feature`).
3. **Set up the correct tool versions**: This project uses a `.tool-versions` file to specify the required versions of Node.js and pnpm. We recommend using either [asdf](https://asdf-vm.com/) or [mise](https://mise.jdx.dev/) to automatically install and use the correct versions:

   ```bash
   # If using asdf
   asdf install

   # If using mise
   mise install
   ```

4. **Install dependencies**: Use `pnpm` to install dependencies.

   ```bash
   pnpm install
   ```

5. **Make changes**: Implement your changes in your branch.
6. **Test your changes**: Ensure that your changes do not break any existing functionality.

7. **Lint your code**: Ensure your code follows the project's coding standards.

   ```bash
   pnpm lint
   ```

8. **Submit a pull request**: Push your changes to your forked repository and open a pull request to the main repository. Provide a clear description of the changes and why they are needed.

### Development Guidelines

1. **Code style**:

   - Follow the coding style and guidelines as configured in our ESLint setup.
   - Ensure code formatting using ESLint. We have `lint-staged` configured to run `eslint --fix` on staged files before committing.

2. **Documentation**: Update documentation as necessary to reflect your changes.
3. **Commit messages**: Write clear and concise commit messages that explain the purpose of the changes.

### Scripts

- **Build**: Build the project using `unbuild`.

  ```bash
  pnpm build
  ```

- **Dev**: Start the development server.

  ```bash
  pnpm dev
  ```

- **Lint**: Lint the project using ESLint.

  ```bash
  pnpm lint
  ```

- **Test**: Run tests using Vitest.

  ```bash
  pnpm test
  ```

- **Typecheck**: Check TypeScript types.

  ```bash
  pnpm typecheck
  ```

- **Release**: Bump version and publish.

  ```bash
  pnpm release
  ```

- **Prepare**: Prepare git hooks using `simple-git-hooks`.

  ```bash
  pnpm prepare
  ```

## Need Help?

If you need assistance or have questions, feel free to reach out to us through our [issue tracker](https://github.com/pawanpaudel93/ao-deploy/issues).

Thank you for contributing!
