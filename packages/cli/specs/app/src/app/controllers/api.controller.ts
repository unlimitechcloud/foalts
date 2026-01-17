import { Context, Get, HttpResponseOK } from '@unlimitechcloud/core';

export class ApiController {

  @Get('/')
  index(ctx: Context) {
    return new HttpResponseOK('Hello world!');
  }

}
