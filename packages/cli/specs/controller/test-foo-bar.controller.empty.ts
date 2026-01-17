import { Context, Get, HttpResponseOK } from '@unlimitechcloud/core';

export class TestFooBarController {

  @Get('/')
  foo(ctx: Context) {
    return new HttpResponseOK();
  }

}
