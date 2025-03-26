
/** @type {import('aegir/types').PartialOptions} */
export default {
  build: {
    bundlesizeMax: '18kB'
  },
  dependencyCheck: {
    ignore: [
      'undici' // required by http-cookie-agent
    ]
  }
}
