// Angular commit convention: <type>(<scope>): <subject>
// Types: build, ci, docs, feat, fix, perf, refactor, style, test
export default {
  extends: ['@commitlint/config-angular'],
  rules: {
    'header-max-length': [2, 'always', 100],
  },
};
