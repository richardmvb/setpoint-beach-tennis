import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandler, inject, Injectable, Provider } from '@angular/core';
import { PostHogService } from './posthog.service';

@Injectable({ providedIn: 'root' })
class PostHogErrorHandler implements ErrorHandler {
  private readonly posthogService = inject(PostHogService);

  handleError(error: unknown): void {
    const extractedError = this.extractError(error);

    if (extractedError) {
      this.posthogService.posthog.captureException(extractedError);
    }

    console.error('ERROR', error);
  }

  private extractError(errorCandidate: unknown): Error | string | null {
    const error = unwrapZoneError(errorCandidate);

    if (error instanceof HttpErrorResponse) {
      return extractHttpError(error);
    }

    if (typeof error === 'string' || isErrorLike(error)) {
      return error;
    }

    return null;
  }
}

function unwrapZoneError(errorCandidate: unknown): unknown {
  if (errorCandidate && typeof errorCandidate === 'object' && 'ngOriginalError' in errorCandidate) {
    return errorCandidate.ngOriginalError;
  }

  return errorCandidate;
}

function extractHttpError(error: HttpErrorResponse): Error | string {
  if (isErrorLike(error.error)) {
    return error.error;
  }

  if (typeof ErrorEvent !== 'undefined' && error.error instanceof ErrorEvent && error.error.message) {
    return error.error.message;
  }

  if (typeof error.error === 'string') {
    return `Server returned code ${error.status} with body "${error.error}"`;
  }

  return error.message;
}

function isErrorLike(value: unknown): value is Error {
  if (value instanceof Error) {
    return true;
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return 'name' in value && 'message' in value && 'stack' in value;
}

export function providePostHogErrorHandler(): Provider {
  return {
    provide: ErrorHandler,
    useExisting: PostHogErrorHandler,
  };
}
