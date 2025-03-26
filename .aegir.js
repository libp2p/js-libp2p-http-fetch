/** @type {import('aegir').PartialOptions} */
export default {
  dependencyCheck: {
    ignore: [
      'undici' // required by http-cookie-agent
    ]
  }
}
