import ts from 'typescript';

import type * as d from '../../../declarations';

export const addNativeElementGetter = (classMembers: ts.ClassElement[], cmp: d.ComponentCompilerMeta) => {
  // @Element() element;
  // is transformed into:
  // get element() { return this; }
  if (cmp.elementRef) {
    classMembers.push(
      ts.createGetAccessor(
        undefined,
        undefined,
        cmp.elementRef,
        [],
        undefined,
        ts.factory.createBlock([ts.createReturn(ts.factory.createThis())])
      )
    );
  }
};
