import { toggleSquawkSession } from './session';

export default defineContentScript({
  registration: 'runtime',
  main() {
    toggleSquawkSession();
  },
});
