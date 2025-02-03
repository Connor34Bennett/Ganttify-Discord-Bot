function buildPath(route) {
  if (process.env.NODE_ENV === 'production') {
    return 'http://206.81.1.248/' + route;
  } else {
    return 'http://localhost:3000/' + route;
  }
}

module.exports = buildPath;