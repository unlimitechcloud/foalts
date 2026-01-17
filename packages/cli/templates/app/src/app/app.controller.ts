import { controller, IAppController } from '@unlimitechcloud/core';

import { ApiController } from './controllers';

export class AppController implements IAppController {
  subControllers = [
    controller('/api', ApiController),
  ];
}
