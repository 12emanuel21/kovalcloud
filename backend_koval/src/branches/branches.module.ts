import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BranchesController, PublicBranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

@Module({
  imports: [AuthModule],
  controllers: [BranchesController, PublicBranchesController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
