/**
 * React access point for the browser half.
 *
 * React is a platform seed: it resolves through the loader's module table and
 * stays external in the bundle, so the plugin never ships a second copy. All
 * rendering goes through JSX (the automatic runtime), never createElement.
 *
 * @module dsh-token-chart/client/react
 */
import * as React from 'react'

export { React }
