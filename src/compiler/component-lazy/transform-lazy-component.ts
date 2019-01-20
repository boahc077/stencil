import * as d from '@declarations';
import { catchError, loadTypeScriptDiagnostics } from '@utils';
import { isComponentClassNode } from '../transformers/transform-utils';
import { removeStaticMetaProperties } from '../transformers/remove-static-meta-properties';
import { removeStencilImport } from '../transformers/remove-stencil-import';
import ts from 'typescript';


export function transformLazyComponent(config: d.Config, buildCtx: d.BuildCtx, build: d.Build, cmp: d.ComponentCompilerMeta, inputJsText: string) {
  if (buildCtx.hasError) {
    return '';
  }

  let outputText = '';

  try {
    const transpileOpts: ts.TranspileOptions = {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        removeComments: (build.isDev || config.logLevel === 'debug') ? false : true,
        target: build.es5 ? ts.ScriptTarget.ES5 : ts.ScriptTarget.ES2017
      },
      fileName: cmp.jsFilePath,
      transformers: {
        after: [
          transformToLazyComponent(build, cmp)
        ]
      }
    };

    const transpileOutput = ts.transpileModule(inputJsText, transpileOpts);

    loadTypeScriptDiagnostics(null, buildCtx.diagnostics, transpileOutput.diagnostics);

    if (!buildCtx.hasError) {
      outputText = transpileOutput.outputText;
    }

  } catch (e) {
    catchError(buildCtx.diagnostics, e);
  }

  return outputText;
}


function transformToLazyComponent(build: d.Build, cmp: d.ComponentCompilerMeta): ts.TransformerFactory<ts.SourceFile> {
  const cmpData: ComponentData = {
    build: build,
    sourceFileNode: null
  };

  return transformCtx => {

    function visitNode(node: ts.Node) {
      if (isComponentClassNode(node, cmp)) {
        return updateComponentClass(node);

      } else if (node.kind === ts.SyntaxKind.ImportDeclaration) {
        return removeStencilImport(node as ts.ImportDeclaration);
      }

      return node;
    }

    return tsSourceFile => {
      cmpData.sourceFileNode = tsSourceFile;

      return ts.visitEachChild(cmpData.sourceFileNode, visitNode, transformCtx);
    };
  };
}


function updateComponentClass(classNode: ts.ClassDeclaration) {
  return ts.updateClassDeclaration(
    classNode,
    classNode.decorators,
    classNode.modifiers,
    classNode.name,
    classNode.typeParameters,
    classNode.heritageClauses,
    updateLazyComponentMembers(classNode)
  );
}


function updateLazyComponentMembers(classNode: ts.ClassDeclaration) {
  const classMembers = removeStaticMetaProperties(classNode);

  updateLazyComponentConstructorMethod(classMembers);

  return classMembers;
}


function updateLazyComponentConstructorMethod(classMembers: ts.ClassElement[]) {
  const cstrMethodIndex = classMembers.findIndex(m => m.kind === ts.SyntaxKind.Constructor);

  const cstrMethodArgs: any = [
    ts.createIdentifier('elmData')
  ];

  const registerLazyInstanceMethodArgs: any = [
    ts.createThis(),
    ts.createIdentifier('elmData')
  ];

  const registerLazyInstanceMethod = ts.createCall(
    ts.createIdentifier(REGISTER_INSTANCE_METHOD),
    undefined,
    registerLazyInstanceMethodArgs
  );

  if (cstrMethodIndex > -1) {
    const cstrMethod = classMembers[cstrMethodIndex] as ts.ConstructorDeclaration;

    classMembers[cstrMethodIndex] = ts.updateConstructor(
      cstrMethod,
      cstrMethod.decorators,
      cstrMethod.modifiers,
      cstrMethodArgs,
      ts.updateBlock(cstrMethod.body, [
        ts.createExpressionStatement(registerLazyInstanceMethod),
        ...cstrMethod.body.statements
      ])
    );

  } else {
    const body = ts.createBlock([
      ts.createExpressionStatement(registerLazyInstanceMethod)
    ], true);

    const cstrMethod = ts.createConstructor(
      undefined,
      undefined,
      cstrMethodArgs,
      body
    );
    classMembers.unshift(cstrMethod);
  }
}


const REGISTER_INSTANCE_METHOD = `registerLazyInstance`;


interface ComponentData {
  build: d.Build;
  sourceFileNode: ts.SourceFile;
}