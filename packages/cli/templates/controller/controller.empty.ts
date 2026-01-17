import { Context, Get, HttpResponseOK } from '@unlimitechcloud/core';

export class /* upperFirstCamelName */Controller {

  @Get('/')
  foo(ctx: Context) {
    return new HttpResponseOK();
  }

}
