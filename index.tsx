import { IScope } from 'angular'
import * as angular from 'angular'
import kebabCase = require('lodash.kebabcase')
import { $injector as defaultInjector } from 'ngimport'
import * as React from 'react'

/**
 * Wraps an Angular component in React. Returns a new React component.
 *
 * Usage:
 *
 *   ```ts
 *   const Bar = { bindings: {...}, template: '...', ... }
 *
 *   angular
 *     .module('foo', [])
 *     .component('bar', Bar)
 *
 *   type Props = {
 *     onChange(value: number): void
 *   }
 *
 *   const Bar = angular2react<Props>('bar', Bar, $compile)
 *
 *   <Bar onChange={...} />
 *   ```
 */

function digest(scope: IScope): void{
  if (!scope) {
      return
  }
  try {scope.$digest() } catch (e) { }
}

export function angular2react<Props extends object>(
  componentName: string,
  component: angular.IComponentOptions,
  $injector = defaultInjector
): React.FunctionComponent<Props> {

  function  getInjector() {
    return $injector || angular.element(document.querySelectorAll('[ng-app]')[0]).injector()
  }

  return function Component(props: Props): any {
    const [didInitialCompile, setDidInitialCompile] = React.useState<Boolean>(false)
    const scope = React.useMemo<IScope>(() => {
      let s = getInjector().get('$rootScope').$new(true);
      Object.assign(s, {props: writable(props)})
      return s;
    }, [])

    React.useEffect(() => {
      return () => {
        if (!scope) {
          return
        }
        scope.$destroy()
      }
    }, [scope])

    // @ts-ignore
    React.useEffect(() => {
      if (!scope) {
        return null
      }
      // @ts-ignore
      scope.props = writable(props)
      digest(scope)
    })

    const bindings: { [key: string]: string } = {}
    if (component.bindings) {
      for (const binding in component.bindings) {
        if (component.bindings[binding].includes('@')) {
          // @ts-ignore
          bindings[kebabCase(binding)] = props[binding]
        } else {
          bindings[kebabCase(binding)] = `props.${binding}`
        }
      }
    }

    function compile(element: HTMLElement) {
      if (didInitialCompile || !scope) {
        return
      }

      const $injector = getInjector()
      $injector.get('$compile')(element)(scope)
      digest(scope)
      setDidInitialCompile(true)
    }

    return React.createElement(
      kebabCase(componentName),
      { ...bindings, ref: compile }
    )
  }

}

/**
 * Angular may try to bind back a value via 2-way binding, but React marks all
 * properties on `props` as non-configurable and non-writable.
 *
 * If we use a `Proxy` to intercept writes to these non-writable properties,
 * we run into an issue where the proxy throws when trying to write anyway,
 * even if we `return false`.
 *
 * Instead, we use the below ad-hoc proxy to catch writes to non-writable
 * properties in `object`, and log a helpful warning when it happens.
 */
function writable<T extends object>(object: T): T {
  const _object = {} as T
  for (const key in object) {
    if (object.hasOwnProperty(key)) {
      Object.defineProperty(_object, key, {
        get() { return object[key] },
        set(value: any) {
          let d = Object.getOwnPropertyDescriptor(object, key)
          if (d && d.writable) {
            return object[key] = value
          } else {
            console.warn(`Tried to write to non-writable property "${key}" of`, object, `. Consider using a callback instead of 2-way binding.`)
          }
        }
      })
    }
  }
  return _object
}
