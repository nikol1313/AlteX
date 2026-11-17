// Demo login page: the portal's form, with AlteX's brand panel beside it. Nobody is signed in.
const { FONTS } = require('./shell');

const BODY = `${FONTS}<app-root><login-component><div class="loginPage-wrapper">
  <h3>ავტორიზაცია</h3>
  <div class="description"><span>შეიყვანეთ პირადი ნომერი და პაროლი</span></div>
  <form class="login-form">
    <div class="ini-form-field"><input formcontrolname="username" placeholder="პირადი ნომერი"></div>
    <div class="ini-form-field"><input formcontrolname="password" type="password" placeholder="პაროლი"></div>
    <div class="buttonWrapper"><button type="submit" class="ini-button">შესვლა</button></div>
  </form>
</div></login-component></app-root>`;

module.exports = { BODY, NOW: '2026-11-16T09:00:00+04:00', url: '/login', student: false };
