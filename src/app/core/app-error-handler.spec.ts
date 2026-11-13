import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideAppErrorHandler } from './app-error-handler';
import { ERROR_REPORTER } from './ports/analytics.port';
import { FakeErrorReporter } from './ports/testing/analytics.fake';

describe('AppErrorHandler', () => {
  let reporter: FakeErrorReporter;
  let handler: ErrorHandler;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reporter = new FakeErrorReporter();
    TestBed.configureTestingModule({
      providers: [provideAppErrorHandler(), { provide: ERROR_REPORTER, useValue: reporter }],
    });
    handler = TestBed.inject(ErrorHandler);
  });

  it('reports an Error to the reporter', () => {
    const error = new Error('boom');
    handler.handleError(error);
    expect(reporter.reported).toEqual([error]);
  });

  it('unwraps the original error that Angular wraps', () => {
    const original = new Error('inner');
    handler.handleError({ ngOriginalError: original });
    expect(reporter.reported).toEqual([original]);
  });

  it('reports a plain string', () => {
    handler.handleError('texto');
    expect(reporter.reported).toEqual(['texto']);
  });

  it('describes an HTTP failure with its status and body', () => {
    handler.handleError(new HttpErrorResponse({ status: 500, error: 'oops' }));
    expect(reporter.reported).toEqual(['Server returned code 500 with body "oops"']);
  });

  it('ignores values that are not errors', () => {
    handler.handleError({ random: true });
    handler.handleError(42);
    expect(reporter.reported).toEqual([]);
  });
});
